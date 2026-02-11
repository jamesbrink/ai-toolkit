'use client';

import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, ContentBlock } from '@/types/claude';
import ConfigProposal from './ConfigProposal';
import DeleteProposal from './DeleteProposal';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-1">{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-') || String(children).includes('\n');
    if (isBlock) {
      return (
        <pre className="bg-gray-950 rounded p-2 my-2 overflow-x-auto text-xs">
          <code>{children}</code>
        </pre>
      );
    }
    return <code className="bg-gray-950 px-1 rounded text-xs">{children}</code>;
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gray-600 pl-3 my-2 text-gray-300">{children}</blockquote>
  ),
  hr: () => <hr className="border-gray-700 my-3" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2 chat-scrollbar">
      <table className="text-xs border-collapse min-w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-gray-700 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-gray-700 px-2 py-1">{children}</td>,
};

function renderText(text: string): React.ReactNode {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown>;
}

function renderContentBlocks(blocks: ContentBlock[]): React.ReactNode {
  return blocks.map((block, i) => {
    if (block.type === 'text' && block.text) {
      return <div key={i}>{renderText(block.text)}</div>;
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
      <div>{renderText(message.content)}</div>
    ) : (
      renderContentBlocks(message.content as ContentBlock[])
    );

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] min-w-0 px-3 py-2 rounded-lg text-sm overflow-x-auto overflow-y-hidden break-words chat-scrollbar ${
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
