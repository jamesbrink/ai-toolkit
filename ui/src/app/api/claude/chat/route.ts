import { NextRequest } from 'next/server';
import { getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeChatModel } from '@/server/claude/client';
import { buildSystemPrompt } from '@/server/claude/systemPrompt';
import {
  serverToolDefinitions,
  SERVER_TOOL_NAMES,
  executeServerTool,
} from '@/server/claude/serverTools';

const MAX_TOOL_LOOPS = 10;
// Reserve tokens for system prompt (~3K) + response (4K) + tools (~2K)
const MAX_MESSAGE_TOKENS = 180_000;

// Rough token estimate: ~4 characters per token
function estimateTokens(messages: { role: string; content: unknown }[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      chars += JSON.stringify(msg.content).length;
    }
  }
  return Math.ceil(chars / 4);
}

// Trim older messages to stay within the token budget.
// Always keeps the most recent messages; drops from the front.
// Preserves at least the last user message + any trailing assistant/tool messages.
function trimMessages(
  messages: { role: string; content: unknown }[],
  maxTokens: number,
): { role: string; content: unknown }[] {
  if (estimateTokens(messages) <= maxTokens) return messages;

  // Drop messages from the front, two at a time (user+assistant pairs),
  // until we're under budget. Always keep at least the last 4 messages.
  const minKeep = Math.min(4, messages.length);
  let trimmed = [...messages];

  while (trimmed.length > minKeep && estimateTokens(trimmed) > maxTokens) {
    trimmed = trimmed.slice(2);
  }

  return trimmed;
}

export async function POST(req: NextRequest) {
  const auth = await getAnthropicAuth();
  if (!auth.apiKey && !auth.oauthToken) {
    return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages, context, tools: clientTools } = await req.json();

  const client = createAnthropicClient(auth);
  const chatModel = await getClaudeChatModel();
  const systemPrompt = await buildSystemPrompt(context, chatModel);

  // Merge server-side tools with any client-side tools
  const allTools = [...serverToolDefinitions, ...(clientTools || [])];

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        let loopMessages = trimMessages(messages, MAX_MESSAGE_TOKENS);
        let iterations = 0;

        while (iterations < MAX_TOOL_LOOPS) {
          iterations++;

          const response = await client.messages.create({
            model: chatModel,
            max_tokens: 4096,
            system: systemPrompt,
            messages: loopMessages,
            ...(allTools.length > 0 ? { tools: allTools } : {}),
          });

          // Check if any content blocks are server-side tool uses
          const serverToolUses = response.content.filter(
            b => b.type === 'tool_use' && SERVER_TOOL_NAMES.has(b.name),
          );

          if (serverToolUses.length > 0) {
            // Emit progress events so the UI shows what tool is being used
            for (const block of serverToolUses) {
              if (block.type === 'tool_use') {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: 'tool_progress',
                      tool_name: block.name,
                    }) + '\n',
                  ),
                );
              }
            }

            // Execute server tools and continue the loop
            const toolResults = await Promise.all(
              serverToolUses.map(async block => {
                if (block.type !== 'tool_use') return null;
                const result = await executeServerTool(
                  block.name,
                  block.input as Record<string, unknown>,
                );
                return { type: 'tool_result' as const, tool_use_id: block.id, content: result };
              }),
            );

            // Emit tool_completed events so the client can trigger refreshes
            for (const block of serverToolUses) {
              if (block.type === 'tool_use') {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: 'tool_completed',
                      tool_name: block.name,
                      tool_input: block.input,
                    }) + '\n',
                  ),
                );
              }
            }

            // Append assistant response + tool results to messages for next iteration
            loopMessages = [
              ...loopMessages,
              { role: 'assistant' as const, content: response.content },
              {
                role: 'user' as const,
                content: toolResults.filter(Boolean),
              },
            ];
            continue;
          }

          // No server tool uses — emit content blocks as NDJSON and finish
          let blockIndex = 0;
          for (const block of response.content) {
            if (block.type === 'text') {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'content_block_start',
                    content_block: { type: 'text', text: '' },
                    index: blockIndex,
                  }) + '\n',
                ),
              );
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'content_block_delta',
                    delta: { type: 'text_delta', text: block.text },
                    index: blockIndex,
                  }) + '\n',
                ),
              );
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: 'content_block_stop', index: blockIndex }) + '\n',
                ),
              );
            } else if (block.type === 'tool_use') {
              // Client-side tool use — emit so the client can handle it
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'content_block_start',
                    content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
                    index: blockIndex,
                  }) + '\n',
                ),
              );
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'content_block_delta',
                    delta: { type: 'input_json_delta', text: JSON.stringify(block.input) },
                    index: blockIndex,
                  }) + '\n',
                ),
              );
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: 'content_block_stop', index: blockIndex }) + '\n',
                ),
              );
            }
            blockIndex++;
          }

          controller.enqueue(encoder.encode(JSON.stringify({ type: 'message_stop' }) + '\n'));
          break;
        }

        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: 'error', error: message }) + '\n'),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
