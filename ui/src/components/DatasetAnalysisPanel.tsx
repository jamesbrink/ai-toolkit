'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle, Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { X, Loader2, AlertTriangle, Eye, Sun, Moon, Minimize2, Copy, Contrast, User, Crop } from 'lucide-react';
import { useDatasetAnalysis } from '@/hooks/useDatasetAnalysis';
import DuplicateGroupCard from '@/components/DuplicateGroupCard';

interface DatasetAnalysisPanelProps {
  isOpen: boolean;
  onClose: () => void;
  datasetName: string;
  onImagesDeleted?: () => void;
  hostId?: string | null;
}

export default function DatasetAnalysisPanel({
  isOpen,
  onClose,
  datasetName,
  onImagesDeleted,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hostId,
}: DatasetAnalysisPanelProps) {
  const {
    status,
    result,
    progress,
    error,
    startAnalysis,
    getStoredResults,
    dismissGroup,
    dismissAllGroups,
    deleteImages,
    cropFaces,
  } = useDatasetAnalysis(datasetName);
  const [selectedQualityImages, setSelectedQualityImages] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'idle' | 'confirm-keep-first' | 'deleting'>('idle');
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropConfig, setCropConfig] = useState({
    outputName: `${datasetName}_faces`,
    resolution: 512,
    padding: 1.8,
  });
  const [cropStatus, setCropStatus] = useState<'idle' | 'cropping' | 'done' | 'error'>('idle');
  const [cropResult, setCropResult] = useState<Record<string, unknown> | null>(null);

  // Try to load stored results when panel opens
  useEffect(() => {
    if (isOpen && status === 'idle') {
      getStoredResults();
    }
  }, [isOpen, status, getStoredResults]);

  // Reset crop config when dataset changes
  useEffect(() => {
    setCropConfig(prev => ({ ...prev, outputName: `${datasetName}_faces` }));
  }, [datasetName]);

  const handleDeleteDuplicates = async (imagePaths: string[]) => {
    const result = await deleteImages(imagePaths);
    if (result.deleted.length > 0) {
      onImagesDeleted?.();
    }
  };

  const activeGroups = result?.duplicateGroups.filter(g => !g.dismissed) ?? [];

  const handleKeepFirstAll = async () => {
    if (!result) return;
    const toDelete = activeGroups.flatMap(g => g.imagePaths.slice(1));
    if (toDelete.length === 0) return;
    setBulkAction('deleting');
    const res = await deleteImages(toDelete);
    if (res.deleted.length > 0) onImagesDeleted?.();
    setBulkAction('idle');
  };

  const handleDeleteQualityImages = async () => {
    if (selectedQualityImages.size === 0) return;
    const result = await deleteImages(Array.from(selectedQualityImages));
    if (result.deleted.length > 0) {
      setSelectedQualityImages(new Set());
      onImagesDeleted?.();
    }
  };

  const toggleQualitySelect = (path: string) => {
    setSelectedQualityImages(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCropFaces = async () => {
    setCropStatus('cropping');
    try {
      const summary = await cropFaces({
        outputDatasetName: cropConfig.outputName,
        trainingResolution: cropConfig.resolution,
        padding: cropConfig.padding,
      });
      setCropResult(summary);
      setCropStatus('done');
    } catch (err) {
      console.error('Face crop failed:', err);
      setCropStatus('error');
    }
  };

  const allIssueImages = result
    ? [
        ...new Set([
          ...result.issues.blurry,
          ...result.issues.dark,
          ...result.issues.bright,
          ...result.issues.tooSmall,
          ...result.issues.lowContrast,
        ]),
      ]
    : [];

  const tabLabels = ['Summary', 'Duplicates', 'Faces', 'Quality Issues'];

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-5xl max-h-[85vh] bg-gray-900 rounded-xl border border-gray-700 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
            <DialogTitle className="text-lg font-medium text-gray-100">
              Dataset Quality Analysis — {datasetName}
            </DialogTitle>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Analysis controls — single button, always force */}
            {(status === 'idle' || status === 'complete' || status === 'error') && (
              <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-3">
                <button
                  onClick={() => startAnalysis(true)}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
                >
                  {result ? 'Re-analyze Dataset' : 'Analyze Dataset'}
                </button>
                {error && <span className="text-sm text-red-400">{error}</span>}
              </div>
            )}

            {/* Progress */}
            {status === 'analyzing' && (
              <div className="px-5 py-6 space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing {progress.current} of {progress.total} images...
                </div>
                {progress.total > 0 && (
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {result && status !== 'analyzing' && (
              <TabGroup>
                <TabList className="flex border-b border-gray-700 px-5">
                  {tabLabels.map(tab => (
                    <Tab
                      key={tab}
                      className={({ selected }) =>
                        `px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px outline-none ${
                          selected
                            ? 'text-blue-400 border-blue-400'
                            : 'text-gray-400 border-transparent hover:text-gray-200'
                        }`
                      }
                    >
                      {tab}
                      {tab === 'Duplicates' && result.summary.duplicateGroupCount > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-900/50 text-amber-300">
                          {result.summary.duplicateGroupCount}
                        </span>
                      )}
                      {tab === 'Faces' && result.summary.facesCount > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-purple-900/50 text-purple-300">
                          {result.summary.facesCount}
                        </span>
                      )}
                      {tab === 'Quality Issues' && allIssueImages.length > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-red-900/50 text-red-300">
                          {allIssueImages.length}
                        </span>
                      )}
                    </Tab>
                  ))}
                </TabList>

                <TabPanels className="p-5">
                  {/* Summary Tab */}
                  <TabPanel className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                      <SummaryCard label="Total Images" value={result.totalImages} />
                      <SummaryCard
                        label="Duplicates"
                        value={result.summary.duplicateGroupCount}
                        icon={<Copy className="w-4 h-4" />}
                        color={result.summary.duplicateGroupCount > 0 ? 'amber' : 'green'}
                      />
                      <SummaryCard
                        label="Blurry"
                        value={result.summary.blurryCount}
                        icon={<Eye className="w-4 h-4" />}
                        color={result.summary.blurryCount > 0 ? 'red' : 'green'}
                      />
                      <SummaryCard
                        label="Dark"
                        value={result.summary.darkCount}
                        icon={<Moon className="w-4 h-4" />}
                        color={result.summary.darkCount > 0 ? 'yellow' : 'green'}
                      />
                      <SummaryCard
                        label="Bright"
                        value={result.summary.brightCount}
                        icon={<Sun className="w-4 h-4" />}
                        color={result.summary.brightCount > 0 ? 'yellow' : 'green'}
                      />
                      <SummaryCard
                        label="Low Contrast"
                        value={result.summary.lowContrastCount}
                        icon={<Contrast className="w-4 h-4" />}
                        color={result.summary.lowContrastCount > 0 ? 'orange' : 'green'}
                      />
                      <SummaryCard
                        label="Too Small"
                        value={result.summary.tooSmallCount}
                        icon={<Minimize2 className="w-4 h-4" />}
                        color={result.summary.tooSmallCount > 0 ? 'orange' : 'green'}
                      />
                      <SummaryCard
                        label="With Faces"
                        value={result.summary.facesCount}
                        icon={<User className="w-4 h-4" />}
                        color={result.summary.facesCount > 0 ? 'purple' : 'gray'}
                      />
                    </div>

                    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-300">Average Quality Score</span>
                        <span className="text-lg font-semibold text-gray-100">
                          {result.summary.avgQualityScore}/100
                        </span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            result.summary.avgQualityScore >= 80
                              ? 'bg-green-500'
                              : result.summary.avgQualityScore >= 60
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${result.summary.avgQualityScore}%` }}
                        />
                      </div>
                    </div>
                  </TabPanel>

                  {/* Duplicates Tab */}
                  <TabPanel className="space-y-4">
                    {result.duplicateGroups.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <Copy className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>No duplicate groups found</p>
                      </div>
                    ) : (
                      <>
                        {/* Bulk actions */}
                        {activeGroups.length > 0 && (
                          <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3 border border-gray-700">
                            <span className="text-sm text-gray-300">
                              {activeGroups.length} duplicate group{activeGroups.length !== 1 ? 's' : ''}{' '}
                              <span className="text-gray-400">
                                ({activeGroups.reduce((sum, g) => sum + g.imagePaths.length - 1, 0)} extra images)
                              </span>
                            </span>
                            {bulkAction === 'confirm-keep-first' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-400">
                                  Delete {activeGroups.reduce((sum, g) => sum + g.imagePaths.length - 1, 0)} duplicates?
                                </span>
                                <button
                                  onClick={handleKeepFirstAll}
                                  className="px-3 py-1.5 text-xs bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setBulkAction('idle')}
                                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : bulkAction === 'deleting' ? (
                              <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Deleting...
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setBulkAction('confirm-keep-first')}
                                  className="px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors"
                                >
                                  Keep First in All
                                </button>
                                <button
                                  onClick={dismissAllGroups}
                                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-600 rounded-lg"
                                >
                                  Dismiss All
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {result.duplicateGroups.map(group => (
                          <DuplicateGroupCard
                            key={group.id}
                            groupId={group.id}
                            imagePaths={group.imagePaths}
                            maxSimilarity={group.maxSimilarity}
                            dismissed={group.dismissed}
                            onDismiss={dismissGroup}
                            onDelete={handleDeleteDuplicates}
                          />
                        ))}
                      </>
                    )}
                  </TabPanel>

                  {/* Faces Tab */}
                  <TabPanel className="space-y-4">
                    {result.summary.facesCount === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>No faces detected in this dataset</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3 border border-gray-700">
                          <span className="text-sm text-gray-300">
                            {result.summary.facesCount} image{result.summary.facesCount !== 1 ? 's' : ''} with detected
                            faces
                          </span>
                          <button
                            onClick={() => {
                              setCropDialogOpen(true);
                              setCropStatus('idle');
                              setCropResult(null);
                            }}
                            className="px-3 py-1.5 text-sm bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Crop className="w-4 h-4" />
                            Crop Faces
                          </button>
                        </div>
                        <p className="text-xs text-gray-400">
                          Face detection uses OpenCV YuNet DNN. &quot;Crop Faces&quot; will create a new sibling dataset
                          with square face crops padded to include head, hair, neck, and shoulders — ideal for LoRA
                          person training.
                        </p>
                      </>
                    )}
                  </TabPanel>

                  {/* Quality Issues Tab */}
                  <TabPanel className="space-y-4">
                    {allIssueImages.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>No quality issues found</p>
                      </div>
                    ) : (
                      <>
                        {selectedQualityImages.size > 0 && (
                          <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3 border border-gray-700">
                            <span className="text-sm text-gray-300">
                              {selectedQualityImages.size} image{selectedQualityImages.size !== 1 ? 's' : ''} selected
                            </span>
                            <button
                              onClick={handleDeleteQualityImages}
                              className="px-3 py-1.5 text-xs bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
                            >
                              Delete Selected
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {allIssueImages.map(imgPath => {
                            const issues: string[] = [];
                            if (result.issues.blurry.includes(imgPath)) issues.push('blurry');
                            if (result.issues.dark.includes(imgPath)) issues.push('dark');
                            if (result.issues.bright.includes(imgPath)) issues.push('bright');
                            if (result.issues.tooSmall.includes(imgPath)) issues.push('small');
                            if (result.issues.lowContrast.includes(imgPath)) issues.push('low contrast');
                            const isSelected = selectedQualityImages.has(imgPath);

                            return (
                              <div
                                key={imgPath}
                                className={`relative rounded-lg border-2 cursor-pointer transition-colors ${
                                  isSelected ? 'border-red-500 bg-red-950/20' : 'border-gray-700 hover:border-gray-600'
                                }`}
                                onClick={() => toggleQualitySelect(imgPath)}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API-served image; next/image optimization not applicable */}
                                <img
                                  src={`/api/img/${encodeURIComponent(imgPath)}`}
                                  alt=""
                                  className="w-full aspect-square object-cover rounded-md"
                                />
                                <div className="absolute bottom-1 left-1 flex flex-wrap gap-1">
                                  {issues.map(issue => (
                                    <span
                                      key={issue}
                                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                        issue === 'blurry'
                                          ? 'bg-red-900/80 text-red-300'
                                          : issue === 'dark' || issue === 'bright'
                                            ? 'bg-yellow-900/80 text-yellow-300'
                                            : 'bg-orange-900/80 text-orange-300'
                                      }`}
                                    >
                                      {issue}
                                    </span>
                                  ))}
                                </div>
                                {isSelected && (
                                  <div className="absolute top-1 right-1 bg-red-600 rounded-full p-0.5">
                                    <X className="w-3 h-3 text-white" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </TabPanel>
                </TabPanels>
              </TabGroup>
            )}

            {/* Empty state */}
            {!result && status !== 'analyzing' && !error && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <AlertTriangle className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">No analysis results yet</p>
                <p className="text-xs mt-1 text-gray-400">
                  Click &quot;Analyze Dataset&quot; to scan for quality issues
                </p>
              </div>
            )}
          </div>
        </DialogPanel>
      </div>

      {/* Face Crop Config Dialog */}
      <Dialog open={cropDialogOpen} onClose={() => setCropDialogOpen(false)} className="relative z-[60]">
        <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md bg-gray-900 rounded-xl border border-gray-700 p-5 space-y-4">
            <DialogTitle className="text-lg font-medium text-gray-100">Crop Faces</DialogTitle>

            {cropStatus === 'idle' && (
              <>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm text-gray-300">Output Dataset Name</span>
                    <input
                      type="text"
                      value={cropConfig.outputName}
                      onChange={e => setCropConfig(prev => ({ ...prev, outputName: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm text-gray-300">Training Resolution</span>
                    <input
                      type="number"
                      value={cropConfig.resolution}
                      onChange={e => setCropConfig(prev => ({ ...prev, resolution: parseInt(e.target.value) || 512 }))}
                      className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm text-gray-300">Padding Multiplier</span>
                    <input
                      type="number"
                      step="0.1"
                      value={cropConfig.padding}
                      onChange={e => setCropConfig(prev => ({ ...prev, padding: parseFloat(e.target.value) || 1.8 }))}
                      className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 text-sm"
                    />
                    <span className="text-xs text-gray-400 mt-1 block">
                      1.8x includes head, hair, neck, shoulders. Lower = tighter crop.
                    </span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setCropDialogOpen(false)}
                    className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCropFaces}
                    className="px-4 py-2 text-sm bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition-colors"
                  >
                    Start Cropping
                  </button>
                </div>
              </>
            )}

            {cropStatus === 'cropping' && (
              <div className="flex items-center gap-3 text-sm text-gray-300 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cropping faces...
              </div>
            )}

            {cropStatus === 'done' && cropResult && (
              <div className="space-y-3">
                <p className="text-sm text-green-400">
                  Created {cropResult.totalCrops as number} face crops from {cropResult.totalImages as number} images.
                </p>
                <p className="text-xs text-gray-400">
                  Output dataset: <span className="text-gray-200">{cropConfig.outputName}</span>
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setCropDialogOpen(false);
                      // Navigate to the new dataset
                      window.location.href = `/datasets/${encodeURIComponent(cropConfig.outputName)}`;
                    }}
                    className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors"
                  >
                    View New Dataset
                  </button>
                </div>
              </div>
            )}

            {cropStatus === 'error' && (
              <div className="space-y-3">
                <p className="text-sm text-red-400">Face cropping failed. Check the console for details.</p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setCropStatus('idle')}
                    className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color = 'gray',
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  color?: 'green' | 'red' | 'yellow' | 'amber' | 'orange' | 'purple' | 'gray';
}) {
  const colorMap = {
    green: 'border-green-800 bg-green-950/20 text-green-400',
    red: 'border-red-800 bg-red-950/20 text-red-400',
    yellow: 'border-yellow-800 bg-yellow-950/20 text-yellow-400',
    amber: 'border-amber-800 bg-amber-950/20 text-amber-400',
    orange: 'border-orange-800 bg-orange-950/20 text-orange-400',
    purple: 'border-purple-800 bg-purple-950/20 text-purple-400',
    gray: 'border-gray-700 bg-gray-800 text-gray-300',
  };

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color]}`}>
      <div className="flex items-center gap-1.5 mb-1 text-xs opacity-70">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
