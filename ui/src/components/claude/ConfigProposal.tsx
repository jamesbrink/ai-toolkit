'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { ConfigChange } from '@/types/claude';
import { useClaudeChat } from './ClaudeChatContext';

interface ConfigProposalProps {
  toolUseId: string;
  changes: ConfigChange[];
}

export default function ConfigProposal({ toolUseId, changes }: ConfigProposalProps) {
  const { sendToolResult } = useClaudeChat();
  const [decisions, setDecisions] = useState<Record<number, 'accepted' | 'rejected'>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!changes || changes.length === 0) {
    return <div className="text-gray-500 text-xs p-2">No changes proposed</div>;
  }

  const handleDecision = (index: number, decision: 'accepted' | 'rejected') => {
    setDecisions(prev => ({ ...prev, [index]: decision }));
  };

  const handleSubmit = () => {
    const accepted = changes
      .filter((_, i) => decisions[i] === 'accepted')
      .map(c => ({ path: c.path, value: c.value }));

    // Dispatch accepted changes via window event (picked up by job page)
    for (const change of accepted) {
      window.dispatchEvent(
        new CustomEvent('claude-config-change', { detail: change }),
      );
    }

    const summary = accepted.length > 0
      ? `Accepted ${accepted.length} of ${changes.length} changes: ${accepted.map(a => a.path).join(', ')}`
      : 'All changes were rejected.';

    sendToolResult(toolUseId, summary);
    setSubmitted(true);
  };

  const allDecided = changes.every((_, i) => decisions[i]);

  return (
    <div className="my-2 space-y-2">
      <div className="text-xs text-gray-400 font-medium">Proposed config changes:</div>
      {changes.map((change, i) => (
        <div
          key={i}
          className={`rounded-lg border text-xs p-2 ${
            decisions[i] === 'accepted'
              ? 'border-green-700 bg-green-950/30'
              : decisions[i] === 'rejected'
                ? 'border-red-700 bg-red-950/30 opacity-60'
                : 'border-gray-700 bg-gray-800'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-mono text-gray-300 truncate">{change.path}</div>
              <div className="text-gray-400 mt-0.5">{change.reason}</div>
              <div className="mt-1 font-mono text-blue-400">
                {JSON.stringify(change.value)}
              </div>
            </div>
            {!submitted && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleDecision(i, 'accepted')}
                  className={`p-1 rounded transition-colors ${
                    decisions[i] === 'accepted' ? 'bg-green-700 text-white' : 'text-gray-500 hover:text-green-400'
                  }`}
                  title="Accept"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDecision(i, 'rejected')}
                  className={`p-1 rounded transition-colors ${
                    decisions[i] === 'rejected' ? 'bg-red-700 text-white' : 'text-gray-500 hover:text-red-400'
                  }`}
                  title="Reject"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      {!submitted && allDecided && (
        <button
          onClick={handleSubmit}
          className="w-full py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Apply {Object.values(decisions).filter(d => d === 'accepted').length} change(s)
        </button>
      )}
      {submitted && (
        <div className="text-xs text-gray-500">Changes applied.</div>
      )}
    </div>
  );
}
