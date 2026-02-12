'use client';

import { useEffect, useState, use, useMemo } from 'react';
import { LuImageOff, LuLoader, LuBan } from 'react-icons/lu';
import { FaChevronLeft, FaPen, FaCopy } from 'react-icons/fa';
import { Sparkles, Search, Download, Upload } from 'lucide-react';
import DatasetImageCard from '@/components/DatasetImageCard';
import { Button } from '@headlessui/react';
import AddImagesModal, { openImagesModal } from '@/components/AddImagesModal';
import { TopBar, MainContent } from '@/components/layout';
import { apiClient } from '@/utils/api';
import { openConfirm } from '@/components/ConfirmModal';
import FullscreenDropOverlay from '@/components/FullscreenDropOverlay';
import CaptionHelper from '@/components/claude/CaptionHelper';
import DatasetAnalysisPanel from '@/components/DatasetAnalysisPanel';
import { useClaudeChat } from '@/components/claude/ClaudeChatContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { proxyApiPath } from '@/utils/proxyPath';
import useHostList from '@/hooks/useHostList';
import DatasetPushModal from '@/components/DatasetPushModal';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export default function DatasetPage({ params }: { params: { datasetName: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hostId = searchParams.get('hostId');
  const isRemote = !!hostId;

  const [imgList, setImgList] = useState<{ img_path: string }[]>([]);
  const usableParams = use(params as any) as { datasetName: string };
  const datasetName = usableParams.datasetName;
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [captionModalOpen, setCaptionModalOpen] = useState(false);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [datasetSize, setDatasetSize] = useState<number | null>(null);
  const [hostName, setHostName] = useState<string>('');
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const { hosts } = useHostList();
  const onlineHosts = hosts.filter(h => h.isOnline);
  const { isConfigured, setContext } = useClaudeChat();

  // Fetch host name for remote banner
  useEffect(() => {
    if (hostId) {
      apiClient
        .get(`/api/hosts/${hostId}`)
        .then(res => setHostName(res.data.name || res.data.address || 'Remote Host'))
        .catch(() => setHostName('Remote Host'));
    }
  }, [hostId]);

  // Set chat context so Claude knows which dataset the user is viewing
  useEffect(() => {
    if (datasetName) {
      setContext({
        page: 'dataset',
        datasetName,
        imageList: imgList.map(img => img.img_path),
        ...(hostId ? { hostId, hostName } : {}),
      });
    }
  }, [datasetName, imgList, setContext, hostId, hostName]);

  // Refresh when Claude agent modifies the dataset
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.toolName === 'delete_dataset_images' || detail?.toolName === 'write_file') {
        refreshImageList(datasetName);
      }
    };
    window.addEventListener('claude-tool-completed', handler);
    return () => window.removeEventListener('claude-tool-completed', handler);
  }, [datasetName]);

  const refreshImageList = (dbName: string) => {
    setStatus('loading');
    apiClient
      .post(proxyApiPath('/api/datasets/listImages', hostId), { datasetName: dbName })
      .then((res: any) => {
        const data = res.data;
        data.images.sort((a: { img_path: string }, b: { img_path: string }) => a.img_path.localeCompare(b.img_path));
        setImgList(data.images);
        setStatus('success');
      })
      .catch(error => {
        console.error('Error fetching images:', error);
        setStatus('error');
      });
  };

  useEffect(() => {
    if (datasetName) {
      refreshImageList(datasetName);
    }
  }, [datasetName]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/datasets/export', {
        method: 'POST',
        headers,
        body: JSON.stringify({ datasetName, includeCaptions: true }),
      });

      if (!res.ok) throw new Error('Export failed');

      const data = await res.json();
      const link = document.createElement('a');
      link.href = `/api/files/${encodeURIComponent(data.zipPath)}`;
      link.download = data.fileName;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  // Fetch dataset size info
  useEffect(() => {
    if (datasetName) {
      apiClient
        .get(proxyApiPath('/api/datasets/list', hostId))
        .then((res: any) => {
          const ds = res.data.find((d: any) => d.name === datasetName);
          if (ds) setDatasetSize(ds.totalSizeBytes);
        })
        .catch(() => {});
    }
  }, [datasetName, imgList.length]);

  const handleDuplicate = () => {
    openConfirm({
      title: 'Duplicate Dataset',
      message: `Enter a name for the copy of "${datasetName}":`,
      type: 'info',
      confirmText: 'Duplicate',
      inputTitle: 'New Name',
      defaultInputValue: `${datasetName}_copy`,
      onConfirm: async (newName?: string) => {
        if (!newName?.trim()) return;
        try {
          const res = await apiClient.post('/api/datasets/copy', {
            sourceName: datasetName,
            newName: newName.trim(),
          });
          router.push(`/datasets/${res.data.name}`);
        } catch (error: any) {
          const msg = error?.response?.data?.error || 'Copy failed';
          alert(msg);
        }
      },
    });
  };

  const handleRename = () => {
    openConfirm({
      title: 'Rename Dataset',
      message: `Enter a new name for "${datasetName}":`,
      type: 'info',
      confirmText: 'Rename',
      inputTitle: 'New Name',
      onConfirm: async (newName?: string) => {
        if (!newName?.trim()) return;
        try {
          const res = await apiClient.post('/api/datasets/rename', {
            oldName: datasetName,
            newName: newName.trim(),
          });
          router.replace(`/datasets/${res.data.name}`);
        } catch (error: any) {
          const msg = error?.response?.data?.error || 'Rename failed';
          alert(msg);
        }
      },
    });
  };

  const PageInfoContent = useMemo(() => {
    let icon = null;
    let text = '';
    let subtitle = '';
    let showIt = false;
    let bgColor = '';
    let textColor = '';
    let iconColor = '';

    if (status == 'loading') {
      icon = <LuLoader className="animate-spin w-8 h-8" />;
      text = 'Loading Images';
      subtitle = 'Please wait while we fetch your dataset images...';
      showIt = true;
      bgColor = 'bg-gray-50 dark:bg-gray-800/50';
      textColor = 'text-gray-900 dark:text-gray-100';
      iconColor = 'text-gray-400';
    }
    if (status == 'error') {
      icon = <LuBan className="w-8 h-8" />;
      text = 'Error Loading Images';
      subtitle = 'There was a problem fetching the images. Please try refreshing the page.';
      showIt = true;
      bgColor = 'bg-red-50 dark:bg-red-950/20';
      textColor = 'text-red-900 dark:text-red-100';
      iconColor = 'text-red-600 dark:text-red-400';
    }
    if (status == 'success' && imgList.length === 0) {
      icon = <LuImageOff className="w-8 h-8" />;
      text = 'No Images Found';
      subtitle = isRemote
        ? 'This remote dataset is empty.'
        : 'This dataset is empty. Click "Add Images" to get started.';
      showIt = true;
      bgColor = 'bg-gray-50 dark:bg-gray-800/50';
      textColor = 'text-gray-900 dark:text-gray-100';
      iconColor = 'text-gray-400';
    }

    if (!showIt) return null;

    return (
      <div
        className={`mt-10 flex flex-col items-center justify-center py-16 px-8 rounded-xl border-2 border-gray-700 border-dashed ${bgColor} ${textColor} mx-auto max-w-md text-center`}
      >
        <div className={`${iconColor} mb-4`}>{icon}</div>
        <h3 className="text-lg font-semibold mb-2">{text}</h3>
        <p className="text-sm opacity-75 leading-relaxed">{subtitle}</p>
      </div>
    );
  }, [status, imgList.length, isRemote]);

  return (
    <>
      {/* Fixed top bar */}
      <TopBar>
        <div>
          <Button className="text-gray-300 px-3 mt-1" onClick={() => history.back()}>
            <FaChevronLeft />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg">Dataset: {datasetName}</h1>
          {!isRemote && (
            <button
              onClick={handleRename}
              className="text-gray-400 hover:text-gray-200 p-1 rounded transition-colors"
              title="Rename dataset"
            >
              <FaPen className="w-3 h-3" />
            </button>
          )}
          {status === 'success' && (
            <span className="text-sm text-gray-400 ml-1">
              {imgList.length} image{imgList.length !== 1 ? 's' : ''}
              {datasetSize !== null && ` · ${formatBytes(datasetSize)}`}
            </span>
          )}
          {isRemote && (
            <span className="px-2 py-0.5 bg-blue-900/50 rounded-full text-xs text-blue-300 ml-2">
              {hostName || 'Remote'}
            </span>
          )}
        </div>
        <div className="flex-1"></div>
        {imgList.length > 0 && (
          <div className="mr-2">
            <Button
              className="text-gray-200 bg-teal-700 hover:bg-teal-600 px-3 py-1 rounded-md flex items-center gap-1.5 text-sm"
              onClick={() => setAnalysisModalOpen(true)}
            >
              <Search className="w-4 h-4" />
              Analyze Quality
            </Button>
          </div>
        )}
        {!isRemote && imgList.length > 0 && (
          <div className="mr-2">
            <Button
              className="text-gray-200 bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded-md flex items-center gap-1.5 text-sm disabled:opacity-50"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export ZIP'}
            </Button>
          </div>
        )}
        {!isRemote && onlineHosts.length > 0 && imgList.length > 0 && (
          <div className="mr-2">
            <Button
              className="text-gray-200 bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded-md flex items-center gap-1.5 text-sm"
              onClick={() => setPushModalOpen(true)}
            >
              <Upload className="w-4 h-4" />
              Push to Host
            </Button>
          </div>
        )}
        {!isRemote && (
          <div className="mr-2">
            <Button
              className="text-gray-200 bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded-md flex items-center gap-1.5 text-sm"
              onClick={handleDuplicate}
            >
              <FaCopy className="w-3.5 h-3.5" />
              Duplicate
            </Button>
          </div>
        )}
        {isConfigured && imgList.length > 0 && (
          <div className="mr-2">
            <Button
              className="text-gray-200 bg-purple-700 hover:bg-purple-600 px-3 py-1 rounded-md flex items-center gap-1.5 text-sm"
              onClick={() => setCaptionModalOpen(true)}
            >
              <Sparkles className="w-4 h-4" />
              Caption with Claude
            </Button>
          </div>
        )}
        {!isRemote && (
          <div>
            <Button
              className="text-gray-200 bg-slate-600 px-3 py-1 rounded-md"
              onClick={() => openImagesModal(datasetName, () => refreshImageList(datasetName))}
            >
              Add Images
            </Button>
          </div>
        )}
      </TopBar>
      <MainContent>
        {isRemote && (
          <div className="mb-4 px-4 py-2 bg-blue-900/30 border border-blue-800 rounded-lg text-sm text-blue-200">
            Viewing remote dataset on <strong>{hostName || 'remote host'}</strong>
          </div>
        )}
        {PageInfoContent}
        {status === 'success' && imgList.length > 0 && (
          <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-3 @lg:grid-cols-4 gap-4">
            {imgList.map(img => (
              <DatasetImageCard
                key={img.img_path}
                alt="image"
                imageUrl={img.img_path}
                hostId={hostId || undefined}
                onDelete={
                  isRemote ? undefined : () => setImgList(prev => prev.filter(item => item.img_path !== img.img_path))
                }
                showAiCaption={!isRemote && isConfigured}
              />
            ))}
          </div>
        )}
      </MainContent>
      {!isRemote && <AddImagesModal />}
      {!isRemote && (
        <FullscreenDropOverlay datasetName={datasetName} onComplete={() => refreshImageList(datasetName)} />
      )}
      {isConfigured && (
        <CaptionHelper
          isOpen={captionModalOpen}
          onClose={() => setCaptionModalOpen(false)}
          imagePaths={imgList.map(img => img.img_path)}
          datasetName={datasetName}
          onCaptionsApplied={() => refreshImageList(datasetName)}
          hostId={hostId}
        />
      )}
      <DatasetAnalysisPanel
        isOpen={analysisModalOpen}
        onClose={() => setAnalysisModalOpen(false)}
        datasetName={datasetName}
        onImagesDeleted={() => refreshImageList(datasetName)}
        hostId={hostId}
      />
      {!isRemote && (
        <DatasetPushModal
          isOpen={pushModalOpen}
          onClose={() => setPushModalOpen(false)}
          datasetName={datasetName}
          hosts={onlineHosts}
        />
      )}
    </>
  );
}
