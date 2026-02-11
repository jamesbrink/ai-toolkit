import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicAuth } from '@/server/settings';
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
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 });
  }

  const { imagePath, style } = await req.json();
  if (!imagePath) {
    return NextResponse.json({ error: 'imagePath required' }, { status: 400 });
  }

  const mediaType = getMediaType(imagePath);
  if (!mediaType) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  let imageData: Buffer;
  try {
    imageData = await fs.readFile(imagePath);
  } catch {
    return NextResponse.json({ error: 'Image file not found' }, { status: 404 });
  }

  const clientOptions: Record<string, unknown> = {};
  if (auth.oauthToken) {
    clientOptions.authToken = auth.oauthToken;
  } else {
    clientOptions.apiKey = auth.apiKey;
  }
  const client = new Anthropic(clientOptions as ConstructorParameters<typeof Anthropic>[0]);

  const stylePrompts: Record<string, string> = {
    descriptive:
      'Describe this image in detail for training a diffusion model. Include subject, appearance, pose, clothing, background, lighting, style, and composition. Be factual and specific.',
    booru:
      'Write booru-style tags for this image, separated by commas. Include subject, clothing, pose, expression, hair, background, lighting, and style tags. Use common danbooru tag format.',
    natural:
      'Write a natural language caption for this image suitable for training a diffusion model. Describe what you see clearly and concisely in 1-2 sentences.',
  };

  const prompt = stylePrompts[style] || stylePrompts.descriptive;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageData.toString('base64'),
            },
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

  return NextResponse.json({ caption });
}
