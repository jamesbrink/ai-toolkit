import { NextRequest } from 'next/server';
import { getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeModel } from '@/server/claude/client';
import { buildSystemPrompt } from '@/server/claude/systemPrompt';

export async function POST(req: NextRequest) {
  const auth = await getAnthropicAuth();
  if (!auth.apiKey && !auth.oauthToken) {
    return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages, context, tools } = await req.json();

  const client = createAnthropicClient(auth);
  const systemPrompt = buildSystemPrompt(context);

  const stream = client.messages.stream({
    model: getClaudeModel(),
    max_tokens: 4096,
    system: systemPrompt,
    messages,
    ...(tools && tools.length > 0 ? { tools } : {}),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        stream.on('contentBlockStart', event => {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: 'content_block_start', content_block: event.contentBlock, index: event.index }) +
                '\n',
            ),
          );
        });

        stream.on('contentBlockDelta', event => {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: 'content_block_delta', delta: event.delta, index: event.index }) + '\n',
            ),
          );
        });

        stream.on('contentBlockStop', event => {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'content_block_stop', index: event.index }) + '\n'),
          );
        });

        await stream.finalMessage();
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'message_stop' }) + '\n'));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
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
