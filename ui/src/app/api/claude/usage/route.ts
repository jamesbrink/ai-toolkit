import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';

export async function GET(req: NextRequest) {
  try {
    const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10);
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days);

    const [allTime, period, byModel, byRoute] = await Promise.all([
      prisma.claudeUsage.aggregate({
        _count: true,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheCreationInputTokens: true,
          cacheReadInputTokens: true,
        },
      }),
      prisma.claudeUsage.aggregate({
        where: { createdAt: { gte: periodStart } },
        _count: true,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheCreationInputTokens: true,
          cacheReadInputTokens: true,
        },
      }),
      prisma.claudeUsage.groupBy({
        by: ['model'],
        where: { createdAt: { gte: periodStart } },
        _count: true,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheCreationInputTokens: true,
          cacheReadInputTokens: true,
        },
      }),
      prisma.claudeUsage.groupBy({
        by: ['routeType'],
        where: { createdAt: { gte: periodStart } },
        _count: true,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheCreationInputTokens: true,
          cacheReadInputTokens: true,
        },
      }),
    ]);

    const formatAggregate = (agg: typeof allTime) => ({
      calls: agg._count,
      inputTokens: agg._sum.inputTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      cacheCreationInputTokens: agg._sum.cacheCreationInputTokens ?? 0,
      cacheReadInputTokens: agg._sum.cacheReadInputTokens ?? 0,
    });

    return NextResponse.json({
      allTime: formatAggregate(allTime),
      period: { days, ...formatAggregate(period) },
      byModel: byModel.map(g => ({
        model: g.model,
        calls: g._count,
        inputTokens: g._sum.inputTokens ?? 0,
        outputTokens: g._sum.outputTokens ?? 0,
        cacheCreationInputTokens: g._sum.cacheCreationInputTokens ?? 0,
        cacheReadInputTokens: g._sum.cacheReadInputTokens ?? 0,
      })),
      byRoute: byRoute.map(g => ({
        routeType: g.routeType,
        calls: g._count,
        inputTokens: g._sum.inputTokens ?? 0,
        outputTokens: g._sum.outputTokens ?? 0,
        cacheCreationInputTokens: g._sum.cacheCreationInputTokens ?? 0,
        cacheReadInputTokens: g._sum.cacheReadInputTokens ?? 0,
      })),
    });
  } catch (err) {
    console.error('Failed to fetch Claude usage:', err);
    return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 });
  }
}
