import { useMemo, useState, useRef, useEffect } from 'react';
import useSampleImages from '@/hooks/useSampleImages';
import SampleImageCard from './SampleImageCard';
import { Job } from '@/server/prismaTypes';
import { JobConfig, UnifiedJob } from '@/types';
import { LuImageOff, LuLoader, LuBan } from 'react-icons/lu';
import { Button } from '@headlessui/react';
import { FaDownload } from 'react-icons/fa';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';
import clsx from 'clsx';
import { FaCaretDown, FaCaretUp } from 'react-icons/fa';
import SampleImageViewer from './SampleImageViewer';
import { getImageUrlPrefix, getFileUrlPrefix } from '@/utils/remoteApi';
import { proxyApiPath } from '@/utils/proxyPath';

interface SampleImagesMenuProps {
  job?: Job | UnifiedJob | null;
  hostId?: string | null;
}

export const SampleImagesMenu = ({ job, hostId }: SampleImagesMenuProps) => {
  const [isZipping, setIsZipping] = useState(false);

  const downloadZip = async () => {
    if (isZipping) return;
    setIsZipping(true);

    try {
      const res = await apiClient.post(proxyApiPath('/api/zip', hostId), {
        zipTarget: 'samples',
        jobName: job?.name,
      });

      const zipPath = res.data.zipPath;
      if (!zipPath) throw new Error('No zipPath in response');

      const downloadPath = `${getFileUrlPrefix(hostId)}${encodeURIComponent(zipPath)}`;
      const a = document.createElement('a');
      a.href = downloadPath;
      a.download = 'samples.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Error downloading zip:', err);
    } finally {
      setIsZipping(false);
    }
  };
  return (
    <Button
      onClick={downloadZip}
      className={clsx(`px-4 py-1 h-8 hover:bg-gray-200 dark:hover:bg-gray-700 inline-flex items-center`, {
        'opacity-50 cursor-not-allowed': isZipping,
      })}
    >
      {isZipping ? <LuLoader className="animate-spin mr-2" /> : <FaDownload className="mr-2" />}
      {isZipping ? 'Preparing' : 'Download'}
    </Button>
  );
};

interface SampleImagesProps {
  job: Job | UnifiedJob;
  hostId?: string | null;
  /** When true, renders inline instead of using absolute positioning (for embedding in other layouts) */
  embedded?: boolean;
}

export default function SampleImages({ job, hostId, embedded }: SampleImagesProps) {
  const { sampleImages, status, refreshSampleImages } = useSampleImages(job.id, 5000, hostId);
  const imageBaseUrl = getImageUrlPrefix(hostId);
  const [selectedSamplePath, setSelectedSamplePath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const didFirstScroll = useRef(false);

  const deleteSample = (imgPath: string) => {
    const deleteRequest = hostId
      ? remoteApi.post(hostId, 'img/delete', { imgPath })
      : apiClient.post('/api/img/delete', { imgPath });
    deleteRequest.then(() => refreshSampleImages()).catch(error => console.error('Error deleting sample:', error));
  };

  const numSamples = useMemo(() => {
    if (job?.job_config) {
      try {
        const jobConfig = JSON.parse(job.job_config) as JobConfig;
        const sampleConfig = jobConfig.config.process[0].sample;
        const numPrompts = sampleConfig.prompts ? sampleConfig.prompts.length : 0;
        const numSamples = sampleConfig.samples.length;
        return Math.max(numPrompts, numSamples, 1);
      } catch {
        return 10;
      }
    }
    return 10;
  }, [job]);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'instant' });
    }
  };

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  const PageInfoContent = useMemo(() => {
    let icon = null;
    let text = '';
    let subtitle = '';
    let showIt = false;
    let bgColor = '';
    let textColor = '';
    let iconColor = '';

    if (sampleImages.length > 0) return null;

    if (status == 'loading') {
      icon = <LuLoader className="animate-spin w-8 h-8" />;
      text = 'Loading Samples';
      subtitle = 'Please wait while we fetch your samples...';
      showIt = true;
      bgColor = 'bg-gray-50 dark:bg-gray-800/50';
      textColor = 'text-gray-900 dark:text-gray-100';
      iconColor = 'text-gray-500 dark:text-gray-400';
    }
    if (status == 'error') {
      icon = <LuBan className="w-8 h-8" />;
      text = 'Error Loading Samples';
      subtitle = 'There was a problem fetching the samples.';
      showIt = true;
      bgColor = 'bg-red-50 dark:bg-red-950/20';
      textColor = 'text-red-900 dark:text-red-100';
      iconColor = 'text-red-600 dark:text-red-400';
    }
    if (status == 'success' && sampleImages.length === 0) {
      icon = <LuImageOff className="w-8 h-8" />;
      text = 'No Samples Found';
      subtitle = 'No samples have been generated yet';
      showIt = true;
      bgColor = 'bg-gray-50 dark:bg-gray-800/50';
      textColor = 'text-gray-900 dark:text-gray-100';
      iconColor = 'text-gray-500 dark:text-gray-400';
    }

    if (!showIt) return null;

    return (
      <div
        className={`mt-10 flex flex-col items-center justify-center py-16 px-8 rounded-xl border-2 border-zinc-300 dark:border-gray-700 border-dashed ${bgColor} ${textColor} mx-auto max-w-md text-center`}
      >
        <div className={`${iconColor} mb-4`}>{icon}</div>
        <h3 className="text-lg font-semibold mb-2">{text}</h3>
        <p className="text-sm opacity-75 leading-relaxed">{subtitle}</p>
      </div>
    );
  }, [status, sampleImages.length]);

  // Responsive column count: on small screens cap to 2, medium to 4, large to full numSamples
  const [cols, setCols] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
    if (w < 640) return Math.min(numSamples, 2);
    if (w < 1024) return Math.min(numSamples, 4);
    return Math.min(numSamples, 40);
  });

  useEffect(() => {
    const updateCols = () => {
      const w = window.innerWidth;
      if (w < 640) setCols(Math.min(numSamples, 2));
      else if (w < 1024) setCols(Math.min(numSamples, 4));
      else setCols(Math.min(numSamples, 40));
    };
    window.addEventListener('resize', updateCols);
    return () => window.removeEventListener('resize', updateCols);
  }, [numSamples]);

  const sampleConfig = useMemo(() => {
    if (job?.job_config) {
      try {
        const jobConfig = JSON.parse(job.job_config) as JobConfig;
        return jobConfig.config.process[0].sample;
      } catch {
        return null;
      }
    }
    return null;
  }, [job]);

  // scroll to bottom on first load of samples
  useEffect(() => {
    if (status === 'success' && sampleImages.length > 0 && !didFirstScroll.current) {
      didFirstScroll.current = true;
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [status, sampleImages.length]);

  return (
    <div
      ref={containerRef}
      className={
        embedded
          ? 'relative overflow-y-auto max-h-[80vh]'
          : 'absolute top-[80px] left-0 right-0 bottom-0 overflow-y-auto'
      }
    >
      <div className="pb-4">
        {PageInfoContent}
        {sampleImages && (
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {sampleImages.map((sample: string, idx: number) => {
              // Compute current group (groups are size = numSamples)
              const groupIndex = Math.floor(idx / numSamples);
              const groupStart = groupIndex * numSamples;
              const groupEnd = Math.min(groupStart + numSamples, sampleImages.length);
              const groupSize = groupEnd - groupStart;
              const isEndOfGroup = idx === groupEnd - 1;

              // Only enforce a MIN of 3 when the grid columns are >= 3 but group is smaller
              const MIN_COLS = 3;
              const shouldPad = cols >= MIN_COLS && numSamples < MIN_COLS && groupSize < MIN_COLS;
              const padsNeeded = shouldPad ? MIN_COLS - groupSize : 0;

              return (
                <div key={sample} className="contents">
                  <SampleImageCard
                    imageUrl={sample}
                    numSamples={numSamples}
                    sampleImages={sampleImages}
                    alt="Sample Image"
                    onClick={() => setSelectedSamplePath(sample)}
                    onDelete={() => deleteSample(sample)}
                    observerRoot={containerRef.current}
                    imageBaseUrl={imageBaseUrl}
                  />

                  {isEndOfGroup &&
                    padsNeeded > 0 &&
                    Array.from({ length: padsNeeded }).map((_, i) => (
                      <div key={`pad-${groupIndex}-${i}`} className="invisible" />
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <SampleImageViewer
        imgPath={selectedSamplePath}
        numSamples={numSamples}
        sampleImages={sampleImages}
        onChange={setPath => setSelectedSamplePath(setPath)}
        sampleConfig={sampleConfig}
        refreshSampleImages={refreshSampleImages}
        imageBaseUrl={imageBaseUrl}
        hostId={hostId}
      />
      {!embedded && (
        <>
          <button
            type="button"
            className="fixed top-20 mt-4 right-6 w-10 h-10 rounded-full bg-white dark:bg-gray-900 shadow-lg flex items-center justify-center text-zinc-700 dark:text-white opacity-80 hover:opacity-100 cursor-pointer border border-zinc-200 dark:border-transparent"
            onClick={scrollToTop}
            aria-label="Scroll to top"
          >
            <FaCaretUp className="text-zinc-500 dark:text-gray-400" />
          </button>
          <button
            type="button"
            className="fixed bottom-5 right-6 w-10 h-10 rounded-full bg-white dark:bg-gray-900 shadow-lg flex items-center justify-center text-zinc-700 dark:text-white opacity-80 hover:opacity-100 cursor-pointer border border-zinc-200 dark:border-transparent"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
          >
            <FaCaretDown className="text-zinc-500 dark:text-gray-400" />
          </button>
        </>
      )}
    </div>
  );
}
