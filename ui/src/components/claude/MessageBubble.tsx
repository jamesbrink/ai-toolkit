'use client';

import React from 'react';
import { ChatMessage, ContentBlock } from '@/types/claude';
import ConfigProposal from './ConfigProposal';
import DeleteProposal from './DeleteProposal';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

function renderCodeBlocks(text: string): React.ReactNode[] {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      const newlineIdx = inner.indexOf('\n');
      const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;
      return (
        <pre key={i} className="bg-gray-950 rounded p-2 my-2 overflow-x-auto text-xs">
          <code>{code}</code>
        </pre>
      );
    }
    // Handle inline code
    const inlineParts = part.split(/(`[^`]+`)/g);
    return inlineParts.map((ip, j) => {
      if (ip.startsWith('`') && ip.endsWith('`')) {
        return (
          <code key={`${i}-${j}`} className="bg-gray-950 px-1 rounded text-xs">
            {ip.slice(1, -1)}
          </code>
        );
      }
      return <span key={`${i}-${j}`}>{ip}</span>;
    });
  });
}

function renderContentBlocks(blocks: ContentBlock[]): React.ReactNode {
  return blocks.map((block, i) => {
    if (block.type === 'text' && block.text) {
      return (
        <div key={i} className="whitespace-pre-wrap">
          {renderCodeBlocks(block.text)}
        </div>
      );
    }
    if (block.type === 'tool_use' && block.name === 'update_job_config') {
      return <ConfigProposal key={i} toolUseId={block.id!} changes={block.input?.changes as any[]} />;
    }
    if (block.type === 'tool_use' && block.name === 'delete_dataset_images') {
      return <DeleteProposal key={i} toolUseId={block.id!} imagePaths={block.input?.image_paths as string[]} reason={block.input?.reason as string} />;
    }
    if (block.type === 'tool_use') {
      return (
        <div key={i} className="bg-gray-950 rounded p-2 my-1 text-xs text-gray-400">
          Tool: {block.name}
        </div>
      );
    }
    return null;
  });
}

export default function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  // Tool result messages are hidden in the UI
  if (Array.isArray(message.content) && message.content.some((b: ContentBlock) => b.type === 'tool_result')) {
    return null;
  }

  const content =
    typeof message.content === 'string' ? (
      <div className="whitespace-pre-wrap">{renderCodeBlocks(message.content)}</div>
    ) : (
      renderContentBlocks(message.content as ContentBlock[])
    );

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
          isUser ? 'bg-gray-700 text-gray-100' : 'bg-gray-800 text-gray-100'
        }`}
      >
        {content}
        {isStreaming && !isUser && (
          <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
}
