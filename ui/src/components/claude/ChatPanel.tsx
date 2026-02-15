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
  crop_faces: 'Cropping faces...',
  list_jobs: 'Listing jobs...',
  create_job: 'Creating job...',
  start_job: 'Starting job...',
  stop_job: 'Stopping job...',
  list_datasets: 'Listing datasets...',
  update_job_config: 'Proposing config changes...',
  explain_config_option: 'Explaining config option...',
  get_job_config: 'Reading job config...',
  compare_jobs: 'Comparing jobs...',
  analyze_samples: 'Analyzing samples...',
  list_runpod_pods: 'Listing RunPod pods...',
  deploy_runpod_pod: 'Deploying RunPod pod...',
  get_runpod_pod_status: 'Checking pod status...',
  stop_runpod_pod: 'Stopping RunPod pod...',
  resume_runpod_pod: 'Resuming RunPod pod...',
  terminate_runpod_pod: 'Terminating RunPod pod...',
  list_runpod_gpu_types: 'Listing GPU types...',
  get_runpod_account: 'Checking RunPod account...',
};

const MIN_WIDTH = 320;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 384; // 24rem = w-96
const WIDTH_STORAGE_KEY = 'claude_chat_width';

export default function ChatPanel() {
  const { isOpen, closePanel, messages, isStreaming, activeToolName, sendMessage, clearMessages, stopStreaming } =
    useClaudeChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Restore persisted width from localStorage after hydration
  useEffect(() => {
    try {
      const stored = localStorage.getItem(WIDTH_STORAGE_KEY);
      if (stored) {
        const n = parseInt(stored, 10);
        if (n >= MIN_WIDTH && n <= MAX_WIDTH) setWidth(n);
      }
    } catch {
      /* ignore */
    }
  }, []);

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
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width]);

  // Resize drag handlers — use refs to avoid stale closures
  const dragStartRef = useRef({ x: 0, width: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartRef.current = { x: e.clientX, width };
      setIsDragging(true);

      const handleMouseMove = (ev: MouseEvent) => {
        // Dragging left edge — moving left increases width
        const delta = dragStartRef.current.x - ev.clientX;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartRef.current.width + delta));
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [width],
  );

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
    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
      <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Claude Assistant</h2>
      <div className="flex items-center gap-1">
        <button
          onClick={clearMessages}
          className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          aria-label="Clear chat"
          title="Clear chat"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={closePanel}
          className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const chatMessages = (
    <div
      ref={messagesContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 chat-scrollbar"
    >
      {messages.length === 0 && (
        <div className="text-center text-zinc-600 dark:text-zinc-400 text-sm mt-8">
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
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs">
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
            className="w-full max-w-md h-dvh bg-white dark:bg-zinc-900 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out data-closed:translate-x-full"
          >
            {chatHeader}
            {chatMessages}
            {chatInput}
          </HeadlessDialogPanel>
        </div>
      </Dialog>

      {/* Desktop: Push layout (>=768px) */}
      <div
        className={`hidden md:block shrink-0 h-full max-w-[40%] overflow-hidden ${
          isDragging ? '' : 'transition-all duration-300 ease-in-out'
        }`}
        style={{ width: isOpen ? width : 0 }}
      >
        <div className="h-full flex bg-white dark:bg-zinc-900 shadow-2xl" style={{ width, minWidth: width }}>
          {/* Resize handle — wider hit area around the visible border line */}
          <div
            onMouseDown={handleMouseDown}
            className="shrink-0 w-3 cursor-col-resize group flex items-stretch justify-start"
          >
            <div
              className={`w-px transition-colors ${
                isDragging ? 'bg-blue-500 w-1' : 'bg-zinc-200 dark:bg-zinc-700 group-hover:bg-blue-400'
              }`}
            />
          </div>
          {/* Chat content */}
          <div className="flex-1 min-w-0 flex flex-col h-full">
            {chatHeader}
            {chatMessages}
            {chatInput}
          </div>
        </div>
      </div>
    </>
  );
}
