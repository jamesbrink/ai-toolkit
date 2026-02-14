'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';
import Link from 'next/link';
import { TextInput } from '@/components/formInputs';
import useDatasetList from '@/hooks/useDatasetList';
import useHostList from '@/hooks/useHostList';
import useAllDatasets from '@/hooks/useAllDatasets';
import { SourcedDatasetInfo } from '@/types';
import { Button } from '@/components/catalyst/button';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { FaRegTrashAlt, FaPen, FaCopy } from 'react-icons/fa';
import { Download, Upload } from 'lucide-react';
import DatasetPushModal from '@/components/DatasetPushModal';
import DatasetPullModal from '@/components/DatasetPullModal';
import { openConfirm } from '@/components/ConfirmModal';
import { TopBar, MainContent } from '@/components/layout';
import UniversalTable, { TableColumn } from '@/components/UniversalTable';
import { apiClient } from '@/utils/api';
import { useRouter } from 'next/navigation';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatRelativeTime(epochMs: number | null): string {
  if (!epochMs) return '-';
  const seconds = Math.floor((Date.now() - epochMs) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function Datasets() {
  const router = useRouter();
  const { hosts } = useHostList();
  const hasHosts = hosts.length > 0;

  // Use aggregated datasets when hosts exist, local-only otherwise
  const { datasets: localDatasets, status: localStatus, refreshDatasets: refreshLocal } = useDatasetList();
  const { allDatasets, isLoading: allLoading, refreshAllDatasets } = useAllDatasets(hosts);

  // Merge: when hosts exist, use allDatasets; otherwise fall back to local
  const datasets: SourcedDatasetInfo[] = hasHosts
    ? allDatasets
    : localDatasets.map(d => ({ ...d, source: { type: 'local' as const } }));
  const isLoading = hasHosts ? allLoading : localStatus === 'loading';
  const refreshDatasets = hasHosts ? refreshAllDatasets : refreshLocal;

  const [newDatasetName, setNewDatasetName] = useState('');
  const [isNewDatasetModalOpen, setIsNewDatasetModalOpen] = useState(false);
  const [exportingDataset, setExportingDataset] = useState<string | null>(null);
  const [pushDataset, setPushDataset] = useState<string | null>(null);
  const [pullDataset, setPullDataset] = useState<{ name: string; hostId: string; hostName: string } | null>(null);
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set());

  const datasetKey = (row: SourcedDatasetInfo) => `${row.source.type}:${row.source.hostId ?? 'local'}:${row.name}`;

  const columns: TableColumn<SourcedDatasetInfo>[] = [
    {
      title: 'Dataset Name',
      key: 'name',
      sortable: true,
      render: (row: SourcedDatasetInfo) => {
        const href =
          row.source.type === 'remote' && row.source.hostId
            ? `/datasets/${row.name}?hostId=${row.source.hostId}`
            : `/datasets/${row.name}`;
        return (
          <Link
            href={href}
            className="text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white font-medium"
          >
            {row.name}
          </Link>
        );
      },
    },
    // Conditionally include Host column only when remote hosts exist
    ...(hasHosts
      ? [
          {
            title: 'Host',
            key: 'hostName',
            sortable: true,
            className: 'w-28',
            render: (row: SourcedDatasetInfo) => (
              <span
                className={
                  row.source.type === 'local' ? 'text-zinc-500 dark:text-zinc-400' : 'text-blue-600 dark:text-blue-300'
                }
              >
                {row.source.type === 'local' ? 'Local' : row.source.hostName}
              </span>
            ),
          } as TableColumn<SourcedDatasetInfo>,
        ]
      : []),
    {
      title: 'Images',
      key: 'imageCount',
      sortable: true,
      className: 'w-24 text-right tabular-nums',
      render: (row: SourcedDatasetInfo) => (
        <span className="text-zinc-700 dark:text-zinc-300">{row.imageCount.toLocaleString()}</span>
      ),
    },
    {
      title: 'Captioned',
      key: 'captionCount',
      sortable: true,
      className: 'w-28 text-right',
      render: (row: SourcedDatasetInfo) => {
        if (row.imageCount === 0) return <span className="text-zinc-500 dark:text-zinc-400">-</span>;
        const pct = Math.round((row.captionCount / row.imageCount) * 100);
        const color =
          pct === 100
            ? 'text-green-600 dark:text-green-400'
            : pct > 0
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-zinc-500 dark:text-zinc-400';
        return (
          <span className={`tabular-nums ${color}`}>
            {row.captionCount}/{row.imageCount}
          </span>
        );
      },
    },
    {
      title: 'Size',
      key: 'totalSizeBytes',
      sortable: true,
      className: 'w-24 text-right tabular-nums',
      render: (row: SourcedDatasetInfo) => (
        <span className="text-zinc-500 dark:text-zinc-400">{formatBytes(row.totalSizeBytes)}</span>
      ),
    },
    {
      title: 'Modified',
      key: 'lastModified',
      sortable: true,
      className: 'w-28 text-right',
      render: (row: SourcedDatasetInfo) => (
        <span className="text-zinc-500 dark:text-zinc-400">{formatRelativeTime(row.lastModified)}</span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      className: 'w-40 text-right',
      render: (row: SourcedDatasetInfo) => {
        const isRemote = row.source.type === 'remote';
        if (isRemote) {
          return (
            <div className="flex items-center justify-end gap-1">
              <button
                className="text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-full transition-colors"
                onClick={() =>
                  setPullDataset({
                    name: row.name,
                    hostId: row.source.hostId!,
                    hostName: row.source.hostName || 'Remote',
                  })
                }
                title="Clone Locally"
              >
                <Download className="w-4 h-4" />
              </button>
              <Link
                href={`/datasets/${row.name}?hostId=${row.source.hostId}`}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors text-xs"
                title="View remote dataset"
              >
                View
              </Link>
            </div>
          );
        }
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors disabled:opacity-40"
              onClick={() => handleExportDataset(row.name)}
              disabled={exportingDataset === row.name || row.imageCount === 0}
              title="Export ZIP"
            >
              <Download className="w-4 h-4" />
            </button>
            {onlineHosts.length > 0 && row.imageCount > 0 && (
              <button
                className="text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-full transition-colors"
                onClick={() => setPushDataset(row.name)}
                title="Push to Host"
              >
                <Upload className="w-4 h-4" />
              </button>
            )}
            <button
              className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors"
              onClick={() => handleCopyDataset(row.name)}
              title="Duplicate"
            >
              <FaCopy className="w-3.5 h-3.5" />
            </button>
            <button
              className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors"
              onClick={() => handleRenameDataset(row.name)}
              title="Rename"
            >
              <FaPen className="w-3 h-3" />
            </button>
            <button
              className="text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 p-2 rounded-full transition-colors"
              onClick={() => handleDeleteDataset(row.name)}
              title="Delete"
            >
              <FaRegTrashAlt className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      },
    },
  ];

  const handleDeleteDataset = (datasetName: string) => {
    openConfirm({
      title: 'Delete Dataset',
      message: `Are you sure you want to delete the dataset "${datasetName}"? This action cannot be undone.`,
      type: 'warning',
      confirmText: 'Delete',
      onConfirm: () => {
        apiClient
          .post('/api/datasets/delete', { name: datasetName })
          .then(() => {
            refreshDatasets();
          })
          .catch(error => {
            console.error('Error deleting dataset:', error);
          });
      },
    });
  };

  const handleExportDataset = async (datasetName: string) => {
    setExportingDataset(datasetName);
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
      setExportingDataset(null);
    }
  };

  const handleCopyDataset = (datasetName: string) => {
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
          const res = await apiClient.post('/api/datasets/copy', { sourceName: datasetName, newName: newName.trim() });
          router.push(`/datasets/${res.data.name}`);
        } catch (error: unknown) {
          const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Copy failed';
          alert(msg);
        }
      },
    });
  };

  const handleRenameDataset = (datasetName: string) => {
    openConfirm({
      title: 'Rename Dataset',
      message: `Enter a new name for "${datasetName}":`,
      type: 'info',
      confirmText: 'Rename',
      inputTitle: 'New Name',
      onConfirm: async (newName?: string) => {
        if (!newName?.trim()) return;
        try {
          await apiClient.post('/api/datasets/rename', { oldName: datasetName, newName: newName.trim() });
          refreshDatasets();
        } catch (error: unknown) {
          const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Rename failed';
          alert(msg);
        }
      },
    });
  };

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/datasets/create', { name: newDatasetName });
      refreshDatasets();
      setNewDatasetName('');
      setIsNewDatasetModalOpen(false);
    } catch (error) {
      console.error('Error creating new dataset:', error);
    }
  };

  const openNewDatasetModal = () => {
    openConfirm({
      title: 'New Dataset',
      message: 'Enter the name of the new dataset:',
      type: 'info',
      confirmText: 'Create',
      inputTitle: 'Dataset Name',
      onConfirm: async (name?: string) => {
        if (!name) {
          console.error('Dataset name is required.');
          return;
        }
        try {
          const data = await apiClient.post('/api/datasets/create', { name }).then(res => res.data);
          if (data.name) {
            router.push(`/datasets/${data.name}`);
          } else {
            refreshDatasets();
          }
        } catch (error) {
          console.error('Error creating new dataset:', error);
        }
      },
    });
  };

  const getSelectedLocalDatasets = () => {
    return datasets.filter(d => d.source.type === 'local' && selectedDatasets.has(datasetKey(d)));
  };

  const handleBulkDelete = () => {
    const localSelected = getSelectedLocalDatasets();
    if (localSelected.length === 0) {
      alert('Only local datasets can be deleted.');
      return;
    }
    openConfirm({
      title: 'Delete Selected Datasets',
      message: `Are you sure you want to delete ${localSelected.length} dataset(s)? This cannot be undone.`,
      type: 'warning',
      confirmText: 'Delete All',
      onConfirm: async () => {
        await Promise.allSettled(localSelected.map(d => apiClient.post('/api/datasets/delete', { name: d.name })));
        setSelectedDatasets(new Set());
        refreshDatasets();
      },
    });
  };

  const handleBulkExport = async () => {
    const localSelected = getSelectedLocalDatasets();
    if (localSelected.length === 0) {
      alert('Only local datasets can be exported.');
      return;
    }
    for (const dataset of localSelected) {
      await handleExportDataset(dataset.name);
    }
    setSelectedDatasets(new Set());
  };

  const onlineHosts = hosts.filter(h => h.isOnline);

  return (
    <>
      <TopBar>
        <div>
          <Heading level={1} className="text-lg">
            Datasets
          </Heading>
        </div>
        <div className="flex-1"></div>
        {onlineHosts.length > 0 && (
          <Text className="text-xs mr-3">
            {onlineHosts.length} remote host{onlineHosts.length !== 1 ? 's' : ''} connected
          </Text>
        )}
        <div>
          <Button color="blue" onClick={() => openNewDatasetModal()}>
            New Dataset
          </Button>
        </div>
      </TopBar>

      <MainContent>
        <UniversalTable
          columns={columns}
          rows={datasets}
          isLoading={isLoading}
          defaultSortKey="name"
          defaultSortDir="asc"
          onRefresh={refreshDatasets}
          selectable
          selectedKeys={selectedDatasets}
          onSelectionChange={setSelectedDatasets}
          rowKey={datasetKey}
          bulkActions={
            <>
              <button
                onClick={handleBulkDelete}
                className="text-xs px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded"
              >
                Delete Selected
              </button>
              <button
                onClick={handleBulkExport}
                className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded"
              >
                Export Selected
              </button>
            </>
          }
        />
      </MainContent>

      <DatasetPushModal
        isOpen={!!pushDataset}
        onClose={() => setPushDataset(null)}
        datasetName={pushDataset || ''}
        hosts={onlineHosts}
      />

      <DatasetPullModal
        isOpen={!!pullDataset}
        onClose={() => {
          setPullDataset(null);
          refreshDatasets();
        }}
        datasetName={pullDataset?.name || ''}
        hostId={pullDataset?.hostId || ''}
        hostName={pullDataset?.hostName || ''}
      />

      <Modal
        isOpen={isNewDatasetModalOpen}
        onClose={() => setIsNewDatasetModalOpen(false)}
        title="New Dataset"
        size="md"
      >
        <div className="space-y-4 text-zinc-800 dark:text-zinc-200">
          <form onSubmit={handleCreateDataset}>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              This will create a new folder with the name below in your dataset folder.
            </div>
            <div className="mt-4">
              <TextInput label="Dataset Name" value={newDatasetName} onChange={value => setNewDatasetName(value)} />
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Button outline onClick={() => setIsNewDatasetModalOpen(false)}>
                Cancel
              </Button>
              <Button color="blue" type="submit">
                Confirm
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
