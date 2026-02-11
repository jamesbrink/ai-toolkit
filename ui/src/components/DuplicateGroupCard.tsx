'use client';

import { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';

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
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 opacity-50">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Group dismissed</span>
          <span>({imagePaths.length} images, {Math.round(maxSimilarity)}% similar)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-700">
            {Math.round(maxSimilarity)}% similar
          </span>
          <span className="text-xs text-gray-400">
            {imagePaths.length} images
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAllExceptFirst}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Keep First
          </button>
          <button
            onClick={() => onDismiss(groupId)}
            className="text-xs text-gray-400 hover:text-gray-200"
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
                  ? 'border-red-500 bg-red-950/20'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => toggleSelect(imgPath)}
              title={filename}
            >
              <img
                src={`/api/img/${encodeURIComponent(imgPath)}`}
                alt={filename}
                className="w-20 h-20 object-cover rounded-md bg-gray-700"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              {i === 0 && !isSelected && (
                <span className="absolute top-0.5 left-0.5 bg-green-700 text-white text-[10px] px-1 rounded">
                  Best
                </span>
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
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Show less' : `Show all ${imagePaths.length} images`}
        </button>
      )}

      {/* Actions */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-700">
          <span className="text-xs text-gray-400">
            {selected.size} selected for deletion
          </span>
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
