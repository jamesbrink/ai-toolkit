import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { SidebarProvider } from '@/components/SidebarContext';
import ConfirmModal from '@/components/ConfirmModal';
import { Suspense } from 'react';
import AuthWrapper from '@/components/AuthWrapper';
import DocModal from '@/components/DocModal';
import { ClaudeChatProvider } from '@/components/claude/ClaudeChatContext';
import ChatPanel from '@/components/claude/ChatPanel';
import PageContextProvider from '@/components/claude/PageContextProvider';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kiln — Ostris AI Toolkit',
  description: 'A toolkit for building AI things.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Check if the AI_TOOLKIT_AUTH environment variable is set
  const authRequired = process.env.AI_TOOLKIT_AUTH ? true : false;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content="Kiln" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthWrapper authRequired={authRequired}>
            <SidebarProvider>
              <ClaudeChatProvider>
                <PageContextProvider>
                  <div className="flex h-dvh bg-white dark:bg-gray-950">
                    <Sidebar />
                    <main className="flex-1 min-w-0 overflow-auto bg-white text-zinc-950 dark:bg-gray-950 dark:text-gray-100 relative">
                      <Suspense>{children}</Suspense>
                    </main>
                    <ChatPanel />
                  </div>
                </PageContextProvider>
              </ClaudeChatProvider>
            </SidebarProvider>
          </AuthWrapper>
        </ThemeProvider>
        <ConfirmModal />
        <DocModal />
      </body>
    </html>
  );
}
