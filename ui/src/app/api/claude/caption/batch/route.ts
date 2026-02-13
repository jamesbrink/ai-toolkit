import { NextRequest } from 'next/server';
import { getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeCaptionModel } from '@/server/claude/client';
import { captionPrompts, captionSystemPrompt, fallbackCaptionPrompt, isRefusal } from '@/server/claude/captionPrompts';
import { fetchRemoteImageBytes } from '@/server/claude/remoteToolExecution';
import { recordUsage } from '@/server/claude/usageTracker';
import fs from 'fs/promises';
import path from 'path';

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

function getMediaType(filePath: string): MediaType | null {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, MediaType> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return map[ext] || null;
}

export async function POST(req: NextRequest) {
  const auth = await getAnthropicAuth();
  if (!auth.apiKey && !auth.oauthToken) {
    return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { imagePaths, style, triggerWord, hostId } = await req.json();
  if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
    return new Response(JSON.stringify({ error: 'imagePaths array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const client = createAnthropicClient(auth);
  let prompt = captionPrompts[style] || captionPrompts.descriptive;
  if (style === 'trigger' && triggerWord) {
    prompt = prompt.replace(/\[trigger\]/g, triggerWord);
  }
  const total = imagePaths.length;
  const model = await getClaudeCaptionModel();

  const extractText = (res: { content: Array<{ type: string; text?: string }> }) =>
    res.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < total; i++) {
        const imagePath = imagePaths[i];
        const mediaType = getMediaType(imagePath);

        if (!mediaType) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ imagePath, caption: '', error: 'Unsupported image type', index: i, total }) + '\n',
            ),
          );
          continue;
        }

        try {
          let imageData: Buffer;
          if (hostId) {
            const remote = await fetchRemoteImageBytes(imagePath, hostId);
            if (!remote) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    imagePath,
                    caption: '',
                    error: 'Could not fetch from remote host',
                    index: i,
                    total,
                  }) + '\n',
                ),
              );
              continue;
            }
            imageData = remote.buffer;
          } else {
            imageData = await fs.readFile(imagePath);
          }
          const imageSource = {
            type: 'base64' as const,
            media_type: mediaType,
            data: imageData.toString('base64'),
          };

          const response = await client.messages.create({
            model,
            max_tokens: 500,
            system: captionSystemPrompt,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image', source: imageSource },
                  { type: 'text', text: prompt },
                ],
              },
            ],
          });
          void recordUsage('caption_batch', model, response);

          let caption = extractText(response);

          // If the model refused, retry with a focused fallback prompt
          if (isRefusal(caption)) {
            const retry = await client.messages.create({
              model,
              max_tokens: 500,
              system: captionSystemPrompt,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'image', source: imageSource },
                    { type: 'text', text: fallbackCaptionPrompt },
                  ],
                },
              ],
            });
            void recordUsage('caption_batch', model, retry);
            caption = extractText(retry);
          }

          controller.enqueue(encoder.encode(JSON.stringify({ imagePath, caption, index: i, total }) + '\n'));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          controller.enqueue(
            encoder.encode(JSON.stringify({ imagePath, caption: '', error: message, index: i, total }) + '\n'),
          );
        }
      }
      controller.close();
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
