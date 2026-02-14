'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar, MainContent } from '@/components/layout';
import { ArrowLeft } from 'lucide-react';
import HostDetailContent from '@/components/HostDetailContent';
import { apiClient } from '@/utils/api';

export default function LocalHostDetailPage() {
  const router = useRouter();
  const [hostname, setHostname] = useState<string>('This Machine');

  useEffect(() => {
    apiClient
      .get('/api/hosts/identify')
      .then(res => {
        setHostname(res.data.hostname || 'This Machine');
      })
      .catch(err => {
        console.error('Failed to fetch local identity:', err);
      });
  }, []);

  return (
    <>
      <TopBar>
        <button
          onClick={() => router.push('/hosts')}
          className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded transition-colors"
          aria-label="Back to hosts"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center space-x-2 ml-1">
          <h1 className="text-lg">{hostname}</h1>
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
        <div className="flex-1"></div>
      </TopBar>
      <MainContent>
        <HostDetailContent mode="local" hostName={hostname} />
      </MainContent>
    </>
  );
}
