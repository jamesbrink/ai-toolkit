'use client';

// Re-export next-themes provider for backward compatibility.
// The actual ThemeProvider is now configured in layout.tsx.
// This file is kept so any imports of ThemeProvider/ThemeContext still resolve.

export { useTheme } from 'next-themes';
