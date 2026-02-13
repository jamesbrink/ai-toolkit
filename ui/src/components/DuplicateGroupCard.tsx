'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';

interface DuplicateGroupCardProps {
  groupId: number;
  imagePaths: string[];
  maxSimilarity: number;
  dismissed: boolean;
  onDismiss: (groupId: number) => void;
  onDelete: (imagePaths: string[]) => void;
}

export default function DuplicateGroupCard({
  groupId,
  imagePaths,
  maxSimilarity,
  dismissed,
  onDismiss,
  onDelete,
}: DuplicateGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visibleImages = expanded ? imagePaths : imagePaths.slice(0, 6);
  const hasMore = imagePaths.length > 6;

  const toggleSelect = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const selectAllExceptFirst = () => {
    // Keep the first image, select all others for deletion
    setSelected(new Set(imagePaths.slice(1)));
  };

  const handleDelete = () => {
    if (selected.size > 0) {
      onDelete(Array.from(selected));
    }
  };

  if (dismissed) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-800/50 p-3 opacity-50">
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Group dismissed</span>
          <span>
            ({imagePaths.length} images, {Math.round(maxSimilarity)}% similar)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
            {Math.round(maxSimilarity)}% similar
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{imagePaths.length} images</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAllExceptFirst}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
            aria-label="Keep first image and select others for deletion"
          >
            Keep First
          </button>
          <button
            onClick={() => onDismiss(groupId)}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            aria-label="Dismiss duplicate group"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Image thumbnails */}
      <div className="flex flex-wrap gap-2">
        {visibleImages.map((imgPath, i) => {
          const isSelected = selected.has(imgPath);
          const filename = imgPath.split('/').pop() || imgPath;
          return (
            <div
              key={imgPath}
              className={`relative cursor-pointer rounded-lg border-2 transition-colors ${
                isSelected
                  ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                  : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500'
              }`}
              onClick={() => toggleSelect(imgPath)}
              title={filename}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API-served image; next/image optimization not applicable */}
              <img
                src={`/api/img/${encodeURIComponent(imgPath)}`}
                alt={filename}
                className="w-20 h-20 object-cover rounded-md bg-zinc-200 dark:bg-zinc-700"
                onError={e => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {i === 0 && !isSelected && (
                <span className="absolute top-0.5 left-0.5 bg-green-700 text-white text-[10px] px-1 rounded">Best</span>
              )}
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 rounded-md">
                  <X className="w-5 h-5 text-red-300" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expand/collapse */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Show less' : `Show all ${imagePaths.length} images`}
        </button>
      )}

      {/* Actions */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{selected.size} selected for deletion</span>
          <button
            onClick={handleDelete}
            className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            Delete {selected.size} image{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
