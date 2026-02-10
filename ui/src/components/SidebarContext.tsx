'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface SidebarContextValue {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Close drawer when viewport grows past mobile breakpoint
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = () => {
      if (mql.matches) setIsOpen(false);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return <SidebarContext.Provider value={{ isOpen, toggle, close }}>{children}</SidebarContext.Provider>;
}
