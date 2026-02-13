'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/utils/api';

interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

interface UsageByModel extends UsageTotals {
  model: string;
}

interface UsageByRoute extends UsageTotals {
  routeType: string;
}

export interface ClaudeUsageData {
  allTime: UsageTotals;
  period: UsageTotals & { days: number };
  byModel: UsageByModel[];
  byRoute: UsageByRoute[];
}

export default function useClaudeUsage(days = 30) {
  const [data, setData] = useState<ClaudeUsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get(`/api/claude/usage?days=${days}`)
      .then(res => {
        setData(res.data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch Claude usage:', err);
        setIsLoading(false);
      });
  }, [days]);

  return { data, isLoading };
}
