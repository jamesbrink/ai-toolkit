import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeModel } from '@/server/claude/client';
import { captionPrompts } from '@/server/claude/captionPrompts';
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

  const client = createAnthropicClient(auth);
  const prompt = captionPrompts[style] || captionPrompts.descriptive;

  const response = await client.messages.create({
    model: getClaudeModel(),
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
