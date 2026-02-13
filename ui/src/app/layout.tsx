import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { SidebarProvider } from '@/components/SidebarContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import ConfirmModal from '@/components/ConfirmModal';
import { Suspense } from 'react';
import AuthWrapper from '@/components/AuthWrapper';
import DocModal from '@/components/DocModal';
import { ClaudeChatProvider } from '@/components/claude/ClaudeChatContext';
import ChatPanel from '@/components/claude/ChatPanel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kiln — Ostris AI Toolkit',
  description: 'A toolkit for building AI things.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Check if the AI_TOOLKIT_AUTH environment variable is set
  const authRequired = process.env.AI_TOOLKIT_AUTH ? true : false;

  return (
    <html lang="en" className="dark">
      <head>
        <meta name="apple-mobile-web-app-title" content="Kiln" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <AuthWrapper authRequired={authRequired}>
            <SidebarProvider>
              <ClaudeChatProvider>
                <div className="flex h-dvh bg-gray-950">
                  <Sidebar />
                  <main className="flex-1 min-w-0 overflow-auto bg-gray-950 text-gray-100 relative">
                    <Suspense>{children}</Suspense>
                  </main>
                  <ChatPanel />
                </div>
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
