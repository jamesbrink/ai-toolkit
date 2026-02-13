'use client';

import { DollarSign, TrendingDown, AlertTriangle } from 'lucide-react';
import { RunPodAccountInfo } from '@/hooks/useRunPodAccount';

interface RunPodAccountWidgetProps {
  account: RunPodAccountInfo;
}

function formatDollars(amount: number | null | undefined): string {
  if (amount == null) return '$—';
  return `$${amount.toFixed(2)}`;
}

function formatTimeRemaining(balance: number | null | undefined, spendPerHr: number | null | undefined): string {
  if (!balance || !spendPerHr || spendPerHr <= 0) return 'No active pods';
  const hours = balance / spendPerHr;
  if (hours < 1) return `${Math.round(hours * 60)}m remaining`;
  if (hours < 24) return `${Math.round(hours)}h remaining`;
  const days = Math.floor(hours / 24);
  const remainHours = Math.round(hours % 24);
  return `${days}d ${remainHours}h remaining`;
}

export default function RunPodAccountWidget({ account }: RunPodAccountWidgetProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 mb-4 dark:border-zinc-800 dark:bg-zinc-900">
      {account.underBalance && (
        <div className="flex items-center space-x-2 mb-3 px-3 py-2 bg-yellow-50 border border-yellow-300 rounded-lg dark:bg-yellow-900/40 dark:border-yellow-800">
          <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span className="text-sm text-yellow-700 dark:text-yellow-300">
            Low balance warning — add credits to avoid pod interruption.
          </span>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-2">
          <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Balance</p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {formatDollars(account.clientBalance)}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <TrendingDown className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Burn Rate</p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {formatDollars(account.currentSpendPerHr)}/hr
            </p>
          </div>
        </div>
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Time Remaining</p>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {formatTimeRemaining(account.clientBalance, account.currentSpendPerHr)}
          </p>
        </div>
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Lifetime Spend</p>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {formatDollars(account.clientLifetimeSpend)}
          </p>
        </div>
      </div>
    </div>
  );
}
