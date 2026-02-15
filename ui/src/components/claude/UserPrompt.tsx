'use client';

import { useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useClaudeChat } from './ClaudeChatContext';

interface PromptOption {
  label: string;
  value: string;
  variant?: 'primary' | 'danger' | 'secondary';
}

interface UserPromptProps {
  toolUseId: string;
  message: string;
  options: PromptOption[];
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  code: ({ children }) => <code className="bg-zinc-100 dark:bg-zinc-950 px-1 rounded text-xs">{children}</code>,
};

const VARIANT_STYLES: Record<string, { base: string; selected: string }> = {
  primary: {
    base: 'bg-blue-600 hover:bg-blue-500 text-white',
    selected: 'bg-blue-700 text-white ring-2 ring-blue-400',
  },
  danger: {
    base: 'bg-red-600 hover:bg-red-500 text-white',
    selected: 'bg-red-700 text-white ring-2 ring-red-400',
  },
  secondary: {
    base: 'border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700',
    selected:
      'border border-zinc-400 dark:border-zinc-500 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 ring-2 ring-zinc-400',
  },
};

export default function UserPrompt({ toolUseId, message, options }: UserPromptProps) {
  const { sendToolResult } = useClaudeChat();
  const [selectedValue, setSelectedValue] = useState<string | null>(null);

  if (!Array.isArray(options) || options.length === 0) {
    return <div className="text-zinc-500 dark:text-zinc-400 text-xs p-2">No options available</div>;
  }

  const handleClick = (value: string) => {
    if (selectedValue !== null) return;
    setSelectedValue(value);
    sendToolResult(toolUseId, value);
  };

  return (
    <div className="my-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-3">
      <div className="text-sm text-zinc-800 dark:text-zinc-200 mb-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message}
        </ReactMarkdown>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const variant = option.variant || 'primary';
          const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;
          const isSelected = selectedValue === option.value;
          const isDisabled = selectedValue !== null;

          return (
            <button
              key={option.value}
              onClick={() => handleClick(option.value)}
              disabled={isDisabled}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isSelected
                  ? styles.selected
                  : isDisabled
                    ? 'opacity-40 cursor-not-allowed ' + styles.base.replace(/hover:\S+/g, '')
                    : styles.base
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {selectedValue !== null && (
        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Selected: {options.find(o => o.value === selectedValue)?.label}
        </div>
      )}
    </div>
  );
}
