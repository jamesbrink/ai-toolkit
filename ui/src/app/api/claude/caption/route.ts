import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeCaptionModel } from '@/server/claude/client';
import { captionPrompts, captionSystemPrompt, fallbackCaptionPrompt, isRefusal } from '@/server/claude/captionPrompts';
import { fetchRemoteImageBytes } from '@/server/claude/remoteToolExecution';
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

  const { imagePath, style, triggerWord, hostId } = await req.json();
  if (!imagePath) {
    return NextResponse.json({ error: 'imagePath required' }, { status: 400 });
  }

  const mediaType = getMediaType(imagePath);
  if (!mediaType) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  let imageData: Buffer;
  if (hostId) {
    // Fetch image bytes from remote host
    const remote = await fetchRemoteImageBytes(imagePath, hostId);
    if (!remote) {
      return NextResponse.json({ error: 'Could not fetch image from remote host' }, { status: 502 });
    }
    imageData = remote.buffer;
  } else {
    try {
      imageData = await fs.readFile(imagePath);
    } catch {
      return NextResponse.json({ error: 'Image file not found' }, { status: 404 });
    }
  }

  const client = createAnthropicClient(auth);
  let prompt = captionPrompts[style] || captionPrompts.descriptive;
  if (style === 'trigger' && triggerWord) {
    prompt = prompt.replace(/\[trigger\]/g, triggerWord);
  }

  const imageSource = {
    type: 'base64' as const,
    media_type: mediaType,
    data: imageData.toString('base64'),
  };

  const model = await getClaudeCaptionModel();

  const extractText = (res: Anthropic.Message) =>
    res.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

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
    caption = extractText(retry);
  }

  return NextResponse.json({ caption });
}
