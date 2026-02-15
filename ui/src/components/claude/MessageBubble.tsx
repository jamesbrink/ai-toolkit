'use client';

import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, ConfigChange, ContentBlock } from '@/types/claude';
import ConfigProposal from './ConfigProposal';
import DeleteProposal from './DeleteProposal';
import UserPrompt from './UserPrompt';

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
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 dark:text-blue-400 underline hover:text-blue-500 dark:hover:text-blue-300"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-') || String(children).includes('\n');
    if (isBlock) {
      return (
        <pre className="bg-zinc-100 dark:bg-zinc-950 rounded p-2 my-2 overflow-x-auto text-xs">
          <code>{children}</code>
        </pre>
      );
    }
    return <code className="bg-zinc-100 dark:bg-zinc-950 px-1 rounded text-xs">{children}</code>;
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-zinc-300 dark:border-zinc-600 pl-3 my-2 text-zinc-600 dark:text-zinc-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-zinc-200 dark:border-zinc-700 my-3" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2 chat-scrollbar">
      <table className="text-xs border-collapse min-w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-1">{children}</td>,
};

function renderText(text: string): React.ReactNode {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {text}
    </ReactMarkdown>
  );
}

function renderContentBlocks(blocks: ContentBlock[]): React.ReactNode {
  return blocks.map((block, i) => {
    if (block.type === 'text' && block.text) {
      return <div key={i}>{renderText(block.text)}</div>;
    }
    if (block.type === 'tool_use' && block.name === 'update_job_config') {
      return <ConfigProposal key={i} toolUseId={block.id!} changes={block.input?.changes as ConfigChange[]} />;
    }
    if (block.type === 'tool_use' && block.name === 'delete_dataset_images') {
      return (
        <DeleteProposal
          key={i}
          toolUseId={block.id!}
          imagePaths={block.input?.image_paths as string[]}
          reason={block.input?.reason as string}
        />
      );
    }
    if (block.type === 'tool_use' && block.name === 'prompt_user') {
      return (
        <UserPrompt
          key={i}
          toolUseId={block.id!}
          message={block.input?.message as string}
          options={
            block.input?.options as Array<{
              label: string;
              value: string;
              variant?: 'primary' | 'danger' | 'secondary';
            }>
          }
        />
      );
    }
    if (block.type === 'tool_use' && block.name === 'explain_config_option') {
      return (
        <div key={i} className="border border-blue-500/40 bg-blue-950/20 rounded-lg p-3 my-2">
          <code className="text-xs text-blue-400">{block.input?.option_path as string}</code>
          <div className="mt-1.5 text-sm text-zinc-300">{renderText(block.input?.explanation as string)}</div>
        </div>
      );
    }
    if (block.type === 'tool_use') {
      return (
        <div key={i} className="bg-zinc-100 dark:bg-zinc-950 rounded p-2 my-1 text-xs text-zinc-600 dark:text-zinc-400">
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
          isUser
            ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
        }`}
      >
        {content}
        {isStreaming && !isUser && <span className="inline-block w-2 h-4 bg-zinc-400 animate-pulse ml-0.5" />}
      </div>
    </div>
  );
}
