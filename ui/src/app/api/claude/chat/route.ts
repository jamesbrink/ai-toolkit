import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { ChatContext } from '@/types/claude';
import { getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeChatModel } from '@/server/claude/client';
import { buildSystemPrompt } from '@/server/claude/systemPrompt';
import {
  serverToolDefinitions,
  SERVER_TOOL_NAMES,
  executeViewImageRemote,
  executeServerTool,
} from '@/server/claude/serverTools';
import { executeToolMaybeRemote, fetchRemoteImageBytes } from '@/server/claude/remoteToolExecution';

// Tools that always execute locally on the hub, even when chatting with a remote host.
// Push/pull are cross-host operations (hub ↔ remote), and list_hosts queries the local DB.
const LOCAL_ONLY_TOOLS = new Set(['list_hosts', 'push_dataset', 'pull_dataset']);
import { recordUsage } from '@/server/claude/usageTracker';

type MessageParam = Anthropic.MessageParam;

const MAX_TOOL_LOOPS = 10;
// Reserve tokens for system prompt (~3K) + response (4K) + tools (~2K)
const MAX_MESSAGE_TOKENS = 180_000;

// Rough token estimate: ~4 characters per token
function estimateTokens(messages: MessageParam[]): number {
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
function trimMessages(messages: MessageParam[], maxTokens: number): MessageParam[] {
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

/**
 * Ensure every assistant tool_use block has a matching tool_result in the next
 * user message. Orphaned tool_use blocks cause a 400 error from the API.
 * This can happen when the client sends a new user message without
 * accepting/rejecting a pending tool proposal, or when trimMessages slices
 * through a tool_use/tool_result pair.
 */
function sanitizeToolPairs(messages: MessageParam[]): MessageParam[] {
  const result: MessageParam[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // If a user message starts with tool_result blocks, verify the preceding
    // assistant message actually contains those tool_use ids. Drop orphaned
    // tool_results that reference trimmed-away tool_use blocks.
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const prev = result[result.length - 1];
      const prevToolIds = new Set<string>();
      if (prev && prev.role === 'assistant' && Array.isArray(prev.content)) {
        for (const b of prev.content as Anthropic.ContentBlock[]) {
          if (b.type === 'tool_use') prevToolIds.add(b.id);
        }
      }

      const filtered = (msg.content as Anthropic.ToolResultBlockParam[]).filter(
        (b) => b.type !== 'tool_result' || prevToolIds.has(b.tool_use_id),
      );

      // If all blocks were orphaned tool_results, skip this message entirely
      if (filtered.length === 0) continue;
      result.push({ ...msg, content: filtered });
      continue;
    }

    result.push(msg);

    // Check assistant messages for tool_use blocks that need tool_results
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;

    const toolUseIds: string[] = [];
    for (const b of msg.content as Anthropic.ContentBlock[]) {
      if (b.type === 'tool_use') toolUseIds.push(b.id);
    }
    if (toolUseIds.length === 0) continue;

    // Check which ids already have results in the next message
    const next = messages[i + 1];
    const existingIds = new Set<string>();
    if (next && next.role === 'user' && Array.isArray(next.content)) {
      for (const b of next.content as Anthropic.ToolResultBlockParam[]) {
        if (b.type === 'tool_result') existingIds.add(b.tool_use_id);
      }
    }

    const missingIds = toolUseIds.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      const syntheticResults: Anthropic.ToolResultBlockParam[] = missingIds.map((id) => ({
        type: 'tool_result' as const,
        tool_use_id: id,
        content: 'User dismissed this action without responding.',
      }));

      if (next && next.role === 'user' && Array.isArray(next.content)) {
        // Merge into the existing user message (handled when we process it next)
        messages[i + 1] = {
          ...next,
          content: [...syntheticResults, ...(next.content as Anthropic.ToolResultBlockParam[])],
        };
      } else {
        result.push({ role: 'user' as const, content: syntheticResults });
      }
    }
  }

  return result;
}

export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  console.log('[claude-chat] POST handler started');

  const auth = await getAnthropicAuth();
  if (!auth.apiKey && !auth.oauthToken) {
    console.error('[claude-chat] No API key or OAuth token configured');
    return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const messages: MessageParam[] = body.messages;
  const context: (ChatContext & { hostId?: string }) | undefined = body.context;
  const clientTools: Anthropic.Tool[] | undefined = body.tools;
  const hostId: string | undefined = context?.hostId;

  console.log(`[claude-chat] Request: ${messages.length} messages, context=${!!context}, hostId=${hostId ?? 'none'}`);

  const client = createAnthropicClient(auth);
  const chatModel = await getClaudeChatModel();
  const systemPrompt = await buildSystemPrompt(context, chatModel);

  // Merge server-side tools with any client-side tools
  const allTools = [...serverToolDefinitions, ...(clientTools || [])];

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        let loopMessages: MessageParam[] = sanitizeToolPairs(trimMessages(messages, MAX_MESSAGE_TOKENS));
        let iterations = 0;

        while (iterations < MAX_TOOL_LOOPS) {
          iterations++;

          console.log(
            `[claude-chat] API call #${iterations}: model=${chatModel}, messages=${loopMessages.length}, tools=${allTools.length}`,
          );
          const apiStart = Date.now();

          const response = await client.messages.create({
            model: chatModel,
            max_tokens: 4096,
            system: systemPrompt,
            messages: loopMessages,
            ...(allTools.length > 0 ? { tools: allTools } : {}),
          });
          void recordUsage('chat', chatModel, response);

          console.log(
            `[claude-chat] API response #${iterations}: stop_reason=${response.stop_reason}, blocks=${response.content.length}, usage=${JSON.stringify(response.usage)}, elapsed=${Date.now() - apiStart}ms`,
          );

          // Check if any content blocks are server-side tool uses
          const serverToolUses = response.content.filter(b => b.type === 'tool_use' && SERVER_TOOL_NAMES.has(b.name));

          if (serverToolUses.length > 0) {
            const toolNames = serverToolUses
              .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
              .map(b => b.name);
            console.log(`[claude-chat] Server tools requested: ${toolNames.join(', ')}`);

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

            // Execute server tools — route to remote host when hostId is set
            const toolResults = await Promise.all(
              serverToolUses.map(async block => {
                if (block.type !== 'tool_use') return null;
                const input = block.input as Record<string, unknown>;
                let result: string;

                const toolStart = Date.now();
                console.log(
                  `[claude-chat] Executing tool: ${block.name}, input keys: ${Object.keys(input).join(', ')}`,
                );

                if (LOCAL_ONLY_TOOLS.has(block.name)) {
                  // Cross-host tools always run on the hub instance
                  result = await executeServerTool(block.name, input);
                } else if (block.name === 'view_dataset_image' && hostId) {
                  // Vision API runs locally (hub has API key), but fetch image from remote
                  const imageData = await fetchRemoteImageBytes(input.image_path as string, hostId);
                  result = imageData
                    ? await executeViewImageRemote(input, imageData.buffer, imageData.mediaType)
                    : 'Error: Could not fetch image from remote host';
                } else {
                  result = await executeToolMaybeRemote(block.name, input, hostId);
                }

                console.log(
                  `[claude-chat] Tool ${block.name} completed: result_length=${result.length}, elapsed=${Date.now() - toolStart}ms`,
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
            const filteredResults = toolResults.filter(
              (r): r is { type: 'tool_result'; tool_use_id: string; content: string } => r !== null,
            );
            loopMessages = [
              ...loopMessages,
              { role: 'assistant' as const, content: response.content },
              {
                role: 'user' as const,
                content: filteredResults,
              },
            ] as MessageParam[];
            continue;
          }

          // No server tool uses — emit content blocks as NDJSON and finish
          console.log(`[claude-chat] Emitting ${response.content.length} content blocks as NDJSON`);
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
                encoder.encode(JSON.stringify({ type: 'content_block_stop', index: blockIndex }) + '\n'),
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
                encoder.encode(JSON.stringify({ type: 'content_block_stop', index: blockIndex }) + '\n'),
              );
            }
            blockIndex++;
          }

          controller.enqueue(encoder.encode(JSON.stringify({ type: 'message_stop' }) + '\n'));
          break;
        }

        console.log(`[claude-chat] Completed: ${iterations} iterations, total_elapsed=${Date.now() - requestStart}ms`);
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const stack = err instanceof Error ? err.stack : undefined;
        console.error(`[claude-chat] Error: ${message}`, stack ?? '');
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: message }) + '\n'));
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
