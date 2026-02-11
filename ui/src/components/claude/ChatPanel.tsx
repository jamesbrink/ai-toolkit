'use client';

import { useRef, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useClaudeChat } from './ClaudeChatContext';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

export default function ChatPanel() {
  const { isOpen, closePanel, messages, isStreaming, sendMessage, clearMessages } = useClaudeChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      className={`fixed top-0 right-0 w-96 h-dvh z-40 bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Header */}
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
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
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
