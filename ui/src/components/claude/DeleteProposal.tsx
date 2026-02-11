'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useClaudeChat } from './ClaudeChatContext';

interface DeleteProposalProps {
  toolUseId: string;
  imagePaths: string[];
  reason: string;
}

export default function DeleteProposal({ toolUseId, imagePaths, reason }: DeleteProposalProps) {
  const { sendToolResult } = useClaudeChat();
  const safePaths = Array.isArray(imagePaths) ? imagePaths : [];
  const [decisions, setDecisions] = useState<Record<number, 'accepted' | 'rejected'>>(() => {
    // Default all to accepted for deletions
    const initial: Record<number, 'accepted' | 'rejected'> = {};
    safePaths.forEach((_, i) => {
      initial[i] = 'accepted';
    });
    return initial;
  });
  const [submitted, setSubmitted] = useState(false);

  if (safePaths.length === 0) {
    return <div className="text-gray-400 text-xs p-2">No images proposed for deletion</div>;
  }

  const handleDecision = (index: number, decision: 'accepted' | 'rejected') => {
    setDecisions(prev => ({ ...prev, [index]: decision }));
  };

  const handleSubmit = async () => {
    const acceptedPaths = safePaths.filter((_, i) => decisions[i] === 'accepted');

    if (acceptedPaths.length > 0) {
      await fetch('/api/datasets/analysis/delete-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePaths: acceptedPaths }),
      });
    }

    const summary =
      acceptedPaths.length > 0
        ? `${acceptedPaths.length} of ${safePaths.length} images deleted.`
        : 'All deletions were rejected.';

    sendToolResult(toolUseId, summary);
    setSubmitted(true);
  };

  const allDecided = safePaths.every((_, i) => decisions[i]);
  const acceptedCount = Object.values(decisions).filter(d => d === 'accepted').length;

  return (
    <div className="my-2 space-y-2">
      <div className="text-xs text-gray-400 font-medium">Proposed image deletions:</div>
      <div className="text-xs text-gray-400 mb-1">{reason}</div>
      {safePaths.map((imgPath, i) => (
        <div
          key={i}
          className={`rounded-lg border text-xs p-2 ${
            decisions[i] === 'accepted'
              ? 'border-red-700 bg-red-950/30'
              : decisions[i] === 'rejected'
                ? 'border-green-700 bg-green-950/30 opacity-60'
                : 'border-gray-700 bg-gray-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <img
                src={`/api/img/${encodeURIComponent(imgPath)}`}
                alt={imgPath.split('/').pop() || ''}
                className="w-16 h-16 object-cover rounded shrink-0"
              />
              <div className="font-mono text-gray-300 truncate">{imgPath.split('/').pop()}</div>
            </div>
            {!submitted && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleDecision(i, 'accepted')}
                  className={`p-1 rounded transition-colors ${
                    decisions[i] === 'accepted' ? 'bg-red-700 text-white' : 'text-gray-400 hover:text-red-400'
                  }`}
                  title="Delete"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDecision(i, 'rejected')}
                  className={`p-1 rounded transition-colors ${
                    decisions[i] === 'rejected' ? 'bg-green-700 text-white' : 'text-gray-400 hover:text-green-400'
                  }`}
                  title="Keep"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      {!submitted && allDecided && acceptedCount > 0 && (
        <button
          onClick={handleSubmit}
          className="w-full py-1.5 text-xs bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
        >
          Confirm Deletion ({acceptedCount} image{acceptedCount !== 1 ? 's' : ''})
        </button>
      )}
      {!submitted && allDecided && acceptedCount === 0 && (
        <button
          onClick={handleSubmit}
          className="w-full py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
        >
          Reject All Deletions
        </button>
      )}
      {submitted && (
        <div className="text-xs text-gray-400">
          {acceptedCount > 0
            ? `${acceptedCount} image${acceptedCount !== 1 ? 's' : ''} deleted.`
            : 'All deletions rejected.'}
        </div>
      )}
    </div>
  );
}
