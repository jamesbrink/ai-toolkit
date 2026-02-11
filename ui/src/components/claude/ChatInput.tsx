'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { SendHorizontal, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
}

export default function ChatInput({ onSend, disabled, isStreaming, onStop }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxRows = 4;
    const lineHeight = 20;
    const maxHeight = lineHeight * maxRows;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  }, []);

  return (
    <div className="flex items-end gap-2 p-3 border-t border-gray-700">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => {
          setText(e.target.value);
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Ask about training config..."
        disabled={disabled}
        rows={1}
        className="flex-1 bg-gray-800 text-gray-100 text-sm rounded-lg px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-gray-600 placeholder-gray-500 disabled:opacity-50"
      />
      {isStreaming ? (
        <button
          onClick={onStop}
          className="p-2 text-red-400 hover:text-red-300 transition-colors"
          aria-label="Stop generation"
          title="Stop generation"
        >
          <Square className="w-5 h-5 fill-current" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="p-2 text-gray-400 hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <SendHorizontal className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
