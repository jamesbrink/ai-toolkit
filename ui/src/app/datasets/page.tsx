'use client';

import { useState, useMemo } from 'react';
import { Modal } from '@/components/Modal';
import Link from 'next/link';
import { TextInput } from '@/components/formInputs';
import useDatasetList from '@/hooks/useDatasetList';
import useHostList from '@/hooks/useHostList';
import useAllDatasets, { groupDatasets } from '@/hooks/useAllDatasets';
import { SourcedDatasetInfo, DatasetGroup } from '@/types';
import { Button } from '@/components/catalyst/button';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { FaRegTrashAlt, FaPen, FaCopy } from 'react-icons/fa';
import { Download, Upload, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import DatasetPushModal from '@/components/DatasetPushModal';
import DatasetPullModal from '@/components/DatasetPullModal';
import DatasetSyncPanel from '@/components/DatasetSyncPanel';
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

function SyncStatusBadge({ group }: { group: DatasetGroup }) {
  if (group.syncStatus === 'synced') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
        title={`${group.instances.length} hosts in sync`}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        {group.instances.length} hosts
      </span>
    );
  }
  if (group.syncStatus === 'diverged') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400"
        title={group.hintText || 'Content differs'}
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        {group.hintText || 'Diverged'}
      </span>
    );
  }
  return null;
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

  // Group datasets by name when hosts exist
  const { groupedDatasets } = useMemo(
    () => (hasHosts ? groupDatasets(datasets) : { groupedDatasets: [] }),
    [hasHosts, datasets],
  );

  const [newDatasetName, setNewDatasetName] = useState('');
  const [isNewDatasetModalOpen, setIsNewDatasetModalOpen] = useState(false);
  const [exportingDataset, setExportingDataset] = useState<string | null>(null);
  const [pushDataset, setPushDataset] = useState<string | null>(null);
  const [pullDataset, setPullDataset] = useState<{ name: string; hostId: string; hostName: string } | null>(null);
  const [syncDataset, setSyncDataset] = useState<{
    name: string;
    hostId: string;
    hostName: string;
  } | null>(null);
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set());

  const onlineHosts = hosts.filter(h => h.isOnline);

  // --- Grouped view columns ---
  const groupedColumns: TableColumn<DatasetGroup>[] = [
    {
      title: 'Dataset Name',
      key: 'name',
      sortable: true,
      render: (group: DatasetGroup) => {
        const localInstance = group.instances.find(i => i.source.type === 'local');
        const href = localInstance
          ? `/datasets/${group.name}`
          : `/datasets/${group.name}?hostId=${group.instances[0].source.hostId}`;
        return (
          <div>
            <Link
              href={href}
              className="text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white font-medium"
            >
              {group.name}
            </Link>
            {group.instances.length > 1 && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {group.instances.map(i => (i.source.type === 'local' ? 'Local' : i.source.hostName)).join(', ')}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Sync',
      key: 'syncStatus',
      sortable: true,
      className: 'w-40',
      render: (group: DatasetGroup) => <SyncStatusBadge group={group} />,
    },
    {
      title: 'Images',
      key: 'imageCount',
      sortable: true,
      className: 'w-32 text-right tabular-nums',
      render: (group: DatasetGroup) => {
        const local = group.instances.find(i => i.source.type === 'local') || group.instances[0];
        if (group.syncStatus === 'diverged' && group.instances.length > 1) {
          const other = group.instances.find(i => i !== local);
          const diff = other ? other.imageCount - local.imageCount : 0;
          if (diff !== 0) {
            const hostName = other?.source.type === 'remote' ? other.source.hostName : 'Local';
            return (
              <span className="text-zinc-700 dark:text-zinc-300">
                {local.imageCount.toLocaleString()}{' '}
                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                  ({diff > 0 ? '+' : ''}
                  {diff} on {hostName})
                </span>
              </span>
            );
          }
        }
        return <span className="text-zinc-700 dark:text-zinc-300">{local.imageCount.toLocaleString()}</span>;
      },
    },
    {
      title: 'Captioned',
      key: 'captionCount',
      sortable: true,
      className: 'w-28 text-right',
      render: (group: DatasetGroup) => {
        const local = group.instances.find(i => i.source.type === 'local') || group.instances[0];
        if (local.imageCount === 0) return <span className="text-zinc-500 dark:text-zinc-400">-</span>;
        const pct = Math.round((local.captionCount / local.imageCount) * 100);
        const color =
          pct === 100
            ? 'text-green-600 dark:text-green-400'
            : pct > 0
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-zinc-500 dark:text-zinc-400';
        return (
          <span className={`tabular-nums ${color}`}>
            {local.captionCount}/{local.imageCount}
          </span>
        );
      },
    },
    {
      title: 'Size',
      key: 'totalSizeBytes',
      sortable: true,
      className: 'w-24 text-right tabular-nums',
      render: (group: DatasetGroup) => {
        const local = group.instances.find(i => i.source.type === 'local') || group.instances[0];
        return <span className="text-zinc-500 dark:text-zinc-400">{formatBytes(local.totalSizeBytes)}</span>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      className: 'w-44 text-right',
      render: (group: DatasetGroup) => {
        const localInstance = group.instances.find(i => i.source.type === 'local');
        const remoteInstance = group.instances.find(i => i.source.type === 'remote');

        return (
          <div className="flex items-center justify-end gap-1">
            {/* Compare & Sync button for diverged groups */}
            {group.syncStatus === 'diverged' && localInstance && remoteInstance && (
              <button
                className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-yellow-600 dark:hover:text-yellow-400 p-2 rounded-full transition-colors"
                onClick={() =>
                  setSyncDataset({
                    name: group.name,
                    hostId: remoteInstance.source.hostId!,
                    hostName: remoteInstance.source.hostName || 'Remote',
                  })
                }
                title="Compare & Sync"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            {/* Export (local only) */}
            {localInstance && (
              <button
                className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-default"
                onClick={() => handleExportDataset(group.name)}
                disabled={exportingDataset === group.name || localInstance.imageCount === 0}
                title="Export ZIP"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            {/* Push (local to remote) */}
            {localInstance && onlineHosts.length > 0 && localInstance.imageCount > 0 && (
              <button
                className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-full transition-colors"
                onClick={() => setPushDataset(group.name)}
                title="Push to Host"
              >
                <Upload className="w-4 h-4" />
              </button>
            )}
            {/* Pull (remote only, no local) */}
            {!localInstance && remoteInstance && (
              <button
                className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-full transition-colors"
                onClick={() =>
                  setPullDataset({
                    name: group.name,
                    hostId: remoteInstance.source.hostId!,
                    hostName: remoteInstance.source.hostName || 'Remote',
                  })
                }
                title="Clone Locally"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            {/* Rename/Delete (local only) */}
            {localInstance && (
              <>
                <button
                  className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors"
                  onClick={() => handleCopyDataset(group.name)}
                  title="Duplicate"
                >
                  <FaCopy className="w-3.5 h-3.5" />
                </button>
                <button
                  className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors"
                  onClick={() => handleRenameDataset(group.name)}
                  title="Rename"
                >
                  <FaPen className="w-3 h-3" />
                </button>
                <button
                  className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 p-2 rounded-full transition-colors"
                  onClick={() => handleDeleteDataset(group.name)}
                  title="Delete"
                >
                  <FaRegTrashAlt className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  // --- Flat view columns (no hosts) ---
  const datasetKey = (row: SourcedDatasetInfo) => `${row.source.type}:${row.source.hostId ?? 'local'}:${row.name}`;

  const flatColumns: TableColumn<SourcedDatasetInfo>[] = [
    {
      title: 'Dataset Name',
      key: 'name',
      sortable: true,
      render: (row: SourcedDatasetInfo) => (
        <Link
          href={`/datasets/${row.name}`}
          className="text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white font-medium"
        >
          {row.name}
        </Link>
      ),
    },
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
      render: (row: SourcedDatasetInfo) => (
        <div className="flex items-center justify-end gap-1">
          <button
            className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-default"
            onClick={() => handleExportDataset(row.name)}
            disabled={exportingDataset === row.name || row.imageCount === 0}
            title="Export ZIP"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors"
            onClick={() => handleCopyDataset(row.name)}
            title="Duplicate"
          >
            <FaCopy className="w-3.5 h-3.5" />
          </button>
          <button
            className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-full transition-colors"
            onClick={() => handleRenameDataset(row.name)}
            title="Rename"
          >
            <FaPen className="w-3 h-3" />
          </button>
          <button
            className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 p-2 rounded-full transition-colors"
            onClick={() => handleDeleteDataset(row.name)}
            title="Delete"
          >
            <FaRegTrashAlt className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
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
        {hasHosts ? (
          <UniversalTable
            columns={groupedColumns}
            rows={groupedDatasets}
            isLoading={isLoading}
            defaultSortKey="name"
            defaultSortDir="asc"
            onRefresh={refreshDatasets}
            rowKey={(g: DatasetGroup) => g.name}
          />
        ) : (
          <UniversalTable
            columns={flatColumns}
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
        )}
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

      <DatasetSyncPanel
        isOpen={!!syncDataset}
        onClose={() => setSyncDataset(null)}
        datasetName={syncDataset?.name || ''}
        hostId={syncDataset?.hostId || ''}
        hostName={syncDataset?.hostName || ''}
        onSyncComplete={refreshDatasets}
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
