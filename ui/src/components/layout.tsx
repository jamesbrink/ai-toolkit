'use client';

import clsx from 'clsx';
import { Menu, Bot } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import { useClaudeChat } from './claude/ClaudeChatContext';

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export const TopBar: React.FC<Props> = ({ children, className }) => {
  const { toggle } = useSidebar();
  const { isConfigured, togglePanel, isOpen } = useClaudeChat();

  return (
    <div
      className={clsx(
        'absolute top-0 left-0 w-full h-12 bg-white dark:bg-gray-900 shadow-sm z-10 flex items-center px-2',
        className,
      )}
    >
      {/* Hamburger button: visible only on mobile */}
      <button
        onClick={toggle}
        className="md:hidden p-3 -ml-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
        aria-label="Open sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>
      {children ? children : null}
      {isConfigured && (
        <button
          onClick={togglePanel}
          className={clsx(
            'ml-auto p-2 rounded-lg transition-colors',
            isOpen
              ? 'text-blue-500 bg-zinc-100 dark:bg-zinc-800'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200',
          )}
          aria-label="Toggle Claude assistant"
          title="Claude Assistant"
        >
          <Bot className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export const MainContent: React.FC<Props> = ({ children, className }) => {
  return (
    <div className={clsx('@container pt-14 px-4 absolute top-0 left-0 w-full h-full overflow-auto', className)}>
      {children ? children : null}
    </div>
  );
};
