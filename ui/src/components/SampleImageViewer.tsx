'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { SampleConfig, SampleItem } from '@/types';
import { Cog } from 'lucide-react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';
import { isVideo } from '@/utils/basic';

interface Props {
  imgPath: string | null; // current image path
  numSamples: number; // number of samples per row
  sampleImages: string[]; // all sample images
  sampleConfig: SampleConfig | null;
  onChange: (nextPath: string | null) => void; // parent setter
  refreshSampleImages?: () => void;
  /** base URL for images, e.g. '/api/img/' or '/api/hosts/{id}/proxy/img/' */
  imageBaseUrl?: string;
  /** when set, delete actions route through the proxy */
  hostId?: string | null;
}

export default function SampleImageViewer({
  imgPath,
  numSamples,
  sampleImages,
  sampleConfig,
  onChange,
  refreshSampleImages,
  imageBaseUrl = '/api/img/',
  hostId,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(Boolean(imgPath));

  useEffect(() => setMounted(true), []);

  // open/close based on external value
  useEffect(() => {
    setIsOpen(Boolean(imgPath));
  }, [imgPath]);

  // after close, clear parent state post-transition
  useEffect(() => {
    if (!isOpen && imgPath) {
      const t = setTimeout(() => onChange(null), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen, imgPath, onChange]);

  const onCancel = useCallback(() => setIsOpen(false), []);

  const imgInfo = useMemo(() => {
    // handle windows C:\\Apps\\AI-Toolkit\\AI-Toolkit\\output\\LoRA-Name\\samples\\1763563000704__000004000_0.jpg
    const ii = { filename: '', step: 0, promptIdx: 0 };
    if (imgPath) {
      // handle windows
      let filename: string | null = null;
      if (imgPath.includes('\\')) {
        const parts = imgPath.split('\\');
        filename = parts[parts.length - 1];
      } else {
        filename = imgPath.split('/').pop() || null;
      }
      if (!filename) {
        console.error('Filename could not be determined from imgPath:', imgPath);
        return ii;
      }
      ii.filename = filename;
      const parts = filename
        .split('.')[0]
        .split('_')
        .filter(p => p !== '');
      if (parts.length === 3) {
        ii.step = parseInt(parts[1]);
        ii.promptIdx = parseInt(parts[2]);
      } else {
        console.error('Unexpected filename format for sample image:', filename);
      }
    }
    return ii;
  }, [imgPath]);

  const setImageAtIndex = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= sampleImages.length) return;
      onChange(sampleImages[idx]);
    },
    [sampleImages, onChange],
  );

  const currentIndex = useMemo(() => {
    if (!imgPath) return -1;
    return sampleImages.findIndex(img => img === imgPath);
  }, [imgPath, sampleImages]);

  const handleArrowUp = useCallback(() => {
    if (currentIndex === -1) return;
    setImageAtIndex(currentIndex - numSamples);
  }, [numSamples, currentIndex, setImageAtIndex]);

  const handleArrowDown = useCallback(() => {
    if (currentIndex === -1) return;
    setImageAtIndex(currentIndex + numSamples);
  }, [numSamples, currentIndex, setImageAtIndex]);

  const handleArrowLeft = useCallback(() => {
    if (currentIndex === -1) return;
    if (imgInfo.promptIdx === 0) return;
    const minIdx = currentIndex - imgInfo.promptIdx;
    const nextIdx = currentIndex - 1;
    if (nextIdx < minIdx) return;
    setImageAtIndex(nextIdx);
  }, [currentIndex, imgInfo.promptIdx, setImageAtIndex]);

  const handleArrowRight = useCallback(() => {
    if (currentIndex === -1) return;
    const stepMinIdx = currentIndex - imgInfo.promptIdx;
    const maxIdx = stepMinIdx + numSamples - 1;
    const nextIdx = currentIndex + 1;
    if (nextIdx > maxIdx) return;
    setImageAtIndex(nextIdx);
  }, [numSamples, currentIndex, imgInfo.promptIdx, setImageAtIndex]);

  const sampleItem = useMemo<SampleItem | null>(() => {
    if (!sampleConfig) return null;
    if (imgInfo.promptIdx < 0) return null;
    if (imgInfo.promptIdx >= sampleConfig.samples.length) return null;
    return sampleConfig.samples[imgInfo.promptIdx];
  }, [sampleConfig, imgInfo]);

  const controlImages = useMemo<string[]>(() => {
    if (!imgPath) return [];
    let controlImageArr: string[] = [];
    if (sampleItem?.ctrl_img) {
      // can be a an array of paths, or a single path
      if (Array.isArray(sampleItem.ctrl_img)) {
        controlImageArr = sampleItem.ctrl_img;
      } else {
        controlImageArr = [sampleItem.ctrl_img];
      }
    } else if (sampleItem?.ctrl_img_1) {
      controlImageArr.push(sampleItem.ctrl_img_1);
    }
    if (sampleItem?.ctrl_img_2) {
      controlImageArr.push(sampleItem.ctrl_img_2);
    }
    if (sampleItem?.ctrl_img_3) {
      controlImageArr.push(sampleItem.ctrl_img_3);
    }
    // filter out nulls
    controlImageArr = controlImageArr.filter(ci => ci !== null && ci !== undefined && ci !== '');
    return controlImageArr;
  }, [sampleItem, imgPath]);

  const seed = useMemo(() => {
    if (!sampleItem) return '?';
    if (sampleItem.seed !== undefined) return sampleItem.seed;
    if (sampleConfig?.walk_seed) {
      return sampleConfig.seed + imgInfo.promptIdx;
    }
    return sampleConfig?.seed ?? '?';
  }, [sampleItem, sampleConfig, imgInfo.promptIdx]);

  // keyboard events while open
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      switch (event.key) {
        case 'Escape':
          onCancel();
          break;
        case 'ArrowUp':
          handleArrowUp();
          break;
        case 'ArrowDown':
          handleArrowDown();
          break;
        case 'ArrowLeft':
          handleArrowLeft();
          break;
        case 'ArrowRight':
          handleArrowRight();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, handleArrowUp, handleArrowDown, handleArrowLeft, handleArrowRight]);

  // Swipe gesture tracking
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!pointerStart.current) return;
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      pointerStart.current = null;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Horizontal swipe: 50px threshold, must exceed vertical by 1.5x
      if (absDx > 50 && absDx > absDy * 1.5) {
        if (dx < 0)
          handleArrowRight(); // swipe left -> next prompt
        else handleArrowLeft(); // swipe right -> prev prompt
      }
      // Vertical swipe: 50px threshold, must exceed horizontal by 1.5x
      else if (absDy > 50 && absDy > absDx * 1.5) {
        if (dy < 0)
          handleArrowDown(); // swipe up -> next step
        else handleArrowUp(); // swipe down -> prev step
      }
    },
    [handleArrowLeft, handleArrowRight, handleArrowUp, handleArrowDown],
  );

  if (!mounted) return null;

  return createPortal(
    <Dialog open={isOpen} onClose={onCancel} className="relative z-10">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-900/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4 text-center">
          <DialogPanel
            transition
            className="relative transform rounded-lg bg-white dark:bg-zinc-800 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in max-w-[95%] max-h-[95vh] data-closed:sm:translate-y-0 data-closed:sm:scale-95 flex flex-col overflow-hidden"
          >
            <div
              className="overflow-hidden flex items-center justify-center"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              style={{ touchAction: 'none' }}
            >
              {imgPath &&
                (isVideo(imgPath) ? (
                  <video
                    src={`${imageBaseUrl}${encodeURIComponent(imgPath)}`}
                    className="w-auto h-auto max-w-[95vw] max-h-[82vh] object-contain"
                    preload="none"
                    playsInline
                    loop
                    autoPlay
                    controls={true}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element -- dynamic API-served sample image; next/image optimization not applicable */
                  <img
                    src={`${imageBaseUrl}${encodeURIComponent(imgPath)}`}
                    alt="Sample Image"
                    className="w-auto h-auto max-w-[95vw] max-h-[82vh] object-contain"
                  />
                ))}
            </div>
            {/* # make full width */}
            <div className="bg-zinc-50 dark:bg-zinc-900 text-sm flex justify-between items-center px-4 py-2">
              <div className="flex-1 relative h-10 min-w-0">
                {sampleItem?.prompt && (
                  <div className="absolute inset-0 grid place-items-center overflow-auto mr-4">
                    <div className="w-full">
                      <span className="text-zinc-600 dark:text-zinc-300 mr-1 font-medium">Prompt:</span>
                      <span className="text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap break-words">
                        {sampleItem.prompt}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              {controlImages.length > 0 && (
                <div key={imgPath} className="flex space-x-2 mr-4">
                  {controlImages.map((ci, idx) => (
                    /* eslint-disable-next-line @next/next/no-img-element -- dynamic API-served control image */
                    <img
                      key={idx}
                      src={`${imageBaseUrl}${encodeURIComponent(ci)}`}
                      alt={`Control ${idx + 1}`}
                      className="max-h-12 max-w-12 object-contain bg-black border border-zinc-300 dark:border-zinc-700 rounded"
                    />
                  ))}
                </div>
              )}

              <div className="text-xs text-zinc-900 dark:text-zinc-100">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">Step:</span>{' '}
                  {imgInfo.step.toLocaleString()}
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">Sample #:</span>{' '}
                  {imgInfo.promptIdx + 1}
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">Seed:</span> {seed}
                </div>
              </div>
            </div>
            <div className="absolute top-2 right-2 bg-zinc-100 dark:bg-zinc-900 rounded-full p-1 leading-[0px] opacity-50 hover:opacity-100">
              <Menu>
                <MenuButton className="flex items-center justify-center">
                  <Cog />
                </MenuButton>
                <MenuItems
                  anchor="bottom end"
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg w-48 px-4 py-2 mt-1 z-50 text-zinc-800 dark:text-zinc-200"
                >
                  <MenuItem>
                    <div
                      className="cursor-pointer text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-2 py-1"
                      onClick={() => {
                        const deleteRequest = hostId
                          ? remoteApi.post(hostId, 'img/delete', { imgPath: imgPath })
                          : apiClient.post('/api/img/delete', { imgPath: imgPath });
                        deleteRequest
                          .then(() => {
                            onChange(null);
                            if (refreshSampleImages) {
                              refreshSampleImages();
                            }
                          })
                          .catch(error => {
                            console.error('Error deleting image:', error);
                          });
                      }}
                    >
                      Delete Sample
                    </div>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>,
    document.body,
  );
}
