import { NextRequest } from 'next/server';
import { getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeModel } from '@/server/claude/client';
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

const stylePrompts: Record<string, string> = {
  descriptive:
    'Describe this image in detail for training a diffusion model. Include subject, appearance, pose, clothing, background, lighting, style, and composition. Be factual and specific.',
  booru:
    'Write booru-style tags for this image, separated by commas. Include subject, clothing, pose, expression, hair, background, lighting, and style tags. Use common danbooru tag format.',
  natural:
    'Write a natural language caption for this image suitable for training a diffusion model. Describe what you see clearly and concisely in 1-2 sentences.',
};

export async function POST(req: NextRequest) {
  const auth = await getAnthropicAuth();
  if (!auth.apiKey && !auth.oauthToken) {
    return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { imagePaths, style } = await req.json();
  if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
    return new Response(JSON.stringify({ error: 'imagePaths array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const client = createAnthropicClient(auth);
  const prompt = stylePrompts[style] || stylePrompts.descriptive;
  const total = imagePaths.length;

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
          const imageData = await fs.readFile(imagePath);
          const response = await client.messages.create({
            model: getClaudeModel(),
            max_tokens: 500,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: { type: 'base64', media_type: mediaType, data: imageData.toString('base64') },
                  },
                  { type: 'text', text: prompt },
                ],
              },
            ],
          });

          const caption = response.content
            .filter(b => b.type === 'text')
            .map(b => (b as { type: 'text'; text: string }).text)
            .join('');

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
