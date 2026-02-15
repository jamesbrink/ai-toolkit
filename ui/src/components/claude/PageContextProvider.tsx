'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useClaudeChat } from './ClaudeChatContext';

export default function PageContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setContext, isConfigured } = useClaudeChat();

  useEffect(() => {
    if (isConfigured) {
      setContext({ page: pathname });
    }
  }, [pathname, isConfigured, setContext]);

  return <>{children}</>;
}
