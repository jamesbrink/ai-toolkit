'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
import { Dialog, DialogBackdrop, DialogPanel as HeadlessDialogPanel } from '@headlessui/react';
import { useClaudeChat } from './ClaudeChatContext';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

const TOOL_LABELS: Record<string, string> = {
  read_file: 'Reading file...',
  list_directory: 'Listing directory...',
  write_file: 'Writing file...',
  analyze_dataset_quality: 'Analyzing dataset quality...',
  get_dataset_issues: 'Checking dataset issues...',
  view_dataset_image: 'Viewing image...',
  delete_dataset_images: 'Deleting images...',
};

const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 384; // 24rem = w-96
const WIDTH_STORAGE_KEY = 'claude_chat_width';

function loadWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  try {
    const stored = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDTH;
}

export default function ChatPanel() {
  const { isOpen, closePanel, messages, isStreaming, activeToolName, sendMessage, clearMessages, stopStreaming } = useClaudeChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [width, setWidth] = useState(loadWidth);
  const isDraggingRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  // Track viewport to gate Dialog open state (prevents scroll-lock/focus-trap on desktop)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Persist width to localStorage
  useEffect(() => {
    try { localStorage.setItem(WIDTH_STORAGE_KEY, String(width)); } catch { /* ignore */ }
  }, [width]);

  // Resize drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      // Dragging left edge — moving left increases width
      const delta = startX - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (isNearBottomRef.current && activeToolName) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeToolName]);

  // Shared chat content rendered in both mobile and desktop
  const chatHeader = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
      <h2 className="text-sm font-medium text-gray-200">Claude Assistant</h2>
      <div className="flex items-center gap-1">
        <button
          onClick={clearMessages}
          className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Clear chat"
          title="Clear chat"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={closePanel}
          className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const chatMessages = (
    <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-3">
      {messages.length === 0 && (
        <div className="text-center text-gray-500 text-sm mt-8">
          <p>Ask me about training config, troubleshooting, or anything about diffusion model training.</p>
        </div>
      )}
      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          message={msg}
          isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
        />
      ))}
      {isStreaming && activeToolName && (
        <div className="flex justify-start mb-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 text-gray-400 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {TOOL_LABELS[activeToolName] || `Running ${activeToolName}...`}
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );

  const chatInput = (
    <ChatInput onSend={sendMessage} disabled={isStreaming} isStreaming={isStreaming} onStop={stopStreaming} />
  );

  return (
    <>
      {/* Mobile: HeadlessUI Dialog overlay (<768px) */}
      <Dialog open={isOpen && isMobile} onClose={closePanel} className="md:hidden relative z-50">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/60 transition-opacity duration-300 data-closed:opacity-0"
        />
        <div className="fixed inset-0 flex justify-end">
          <HeadlessDialogPanel
            transition
            className="w-full max-w-md h-dvh bg-gray-900 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out data-closed:translate-x-full"
          >
            {chatHeader}
            {chatMessages}
            {chatInput}
          </HeadlessDialogPanel>
        </div>
      </Dialog>

      {/* Desktop: Push layout (>=768px) */}
      <div
        className={`hidden md:block shrink-0 h-dvh overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'border-l border-gray-700' : ''
        }`}
        style={{ width: isOpen ? width : 0 }}
      >
        <div
          className="h-full flex flex-col bg-gray-900 shadow-2xl relative"
          style={{ width, minWidth: width }}
        >
          {/* Resize handle */}
          <div
            onMouseDown={handleMouseDown}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10"
          />
          {chatHeader}
          {chatMessages}
          {chatInput}
        </div>
      </div>
    </>
  );
}
