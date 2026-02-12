'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/utils/api';

export interface RunPodAccountInfo {
  clientBalance: number | null;
  currentSpendPerHr: number | null;
  underBalance: boolean | null;
  minBalance: number | null;
  spendLimit: number | null;
  clientLifetimeSpend: number | null;
}

export default function useRunPodAccount(enabled = true) {
  const [account, setAccount] = useState<RunPodAccountInfo | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const refreshAccount = async () => {
    setStatus('loading');
    try {
      const res = await apiClient.get('/api/runpod/account');
      setAccount(res.data.account);
      setStatus('success');
    } catch (err) {
      console.error(`Failed to fetch RunPod account: ${err instanceof Error ? err.message : String(err)}`);
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!enabled) return;
    refreshAccount();
    const interval = setInterval(refreshAccount, 30000);
    return () => clearInterval(interval);
  }, [enabled]);

  return { account, status, refreshAccount };
}
