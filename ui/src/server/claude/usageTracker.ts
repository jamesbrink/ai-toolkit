import prisma from '@/server/prisma';
import type Anthropic from '@anthropic-ai/sdk';

type UsageResponse = Pick<Anthropic.Message, 'usage'>;

/**
 * Record token usage from an Anthropic API response.
 * Fire-and-forget — catches and logs errors so it never breaks callers.
 */
export async function recordUsage(routeType: string, model: string, response: UsageResponse): Promise<void> {
  try {
    const { usage } = response;
    await prisma.claudeUsage.create({
      data: {
        routeType,
        model,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheCreationInputTokens: (usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: (usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
      },
    });
  } catch (err) {
    console.error('[usageTracker] Failed to record usage:', err);
  }
}
