'use client';

import { createContext, useState } from 'react';

const ThemeContext = createContext({ isDark: true });

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isDark] = useState(true);

  return <ThemeContext.Provider value={{ isDark }}>{children}</ThemeContext.Provider>;
};
