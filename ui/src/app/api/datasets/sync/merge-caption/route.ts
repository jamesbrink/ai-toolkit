import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeCaptionModel } from '@/server/claude/client';
import { recordUsage } from '@/server/claude/usageTracker';

const MERGE_SYSTEM_PROMPT = [
  'You are a caption merging assistant for an AI training dataset.',
  'You receive two captions for the same image from different sources.',
  'Your job is to produce a single merged caption that combines the best details from both.',
  'Preserve all unique visual details from both captions.',
  'If they conflict, prefer the more specific or detailed description.',
  'Output ONLY the merged caption — no explanation, no preamble, no markdown.',
  'The caption must be plain text suitable for diffusion model training.',
].join(' ');

export async function POST(req: NextRequest) {
  try {
    const auth = await getAnthropicAuth();
    if (!auth.apiKey && !auth.oauthToken) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 });
    }

    const { localCaption, remoteCaption } = await req.json();

    if (localCaption == null || remoteCaption == null) {
      return NextResponse.json({ error: 'localCaption and remoteCaption are required' }, { status: 400 });
    }

    const client = createAnthropicClient(auth);
    const model = await getClaudeCaptionModel();

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: MERGE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Merge these two captions for the same image:\n\nCaption A (local):\n${localCaption}\n\nCaption B (remote):\n${remoteCaption}`,
            },
          ],
        },
      ],
    });

    const mergedCaption =
      response.content
        .filter(block => block.type === 'text')
        .map(block => ('text' in block ? block.text : ''))
        .join('')
        .trim() || '';

    recordUsage('caption-merge', model, response);

    return NextResponse.json({ mergedCaption });
  } catch (error) {
    console.error('Caption merge error:', error);
    return NextResponse.json({ error: 'Failed to merge captions' }, { status: 500 });
  }
}
