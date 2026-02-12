import React, { useRef, useEffect, useState, ReactNode, KeyboardEvent } from 'react';
import { FaTrashAlt, FaEye, FaEyeSlash } from 'react-icons/fa';
import { Sparkles, Loader2 } from 'lucide-react';
import { openConfirm } from './ConfirmModal';
import classNames from 'classnames';
import { apiClient } from '@/utils/api';
import AudioPlayer from './AudioPlayer';
import { isVideo, isAudio } from '@/utils/basic';
import { proxyApiPath } from '@/utils/proxyPath';

interface DatasetImageCardProps {
  imageUrl: string;
  alt: string;
  children?: ReactNode;
  className?: string;
  onDelete?: () => void;
  showAiCaption?: boolean;
  hostId?: string;
}

const DatasetImageCard: React.FC<DatasetImageCardProps> = ({
  imageUrl,
  alt,
  children,
  className = '',
  onDelete,
  showAiCaption = false,
  hostId,
}) => {
  const isRemote = !!hostId;
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [inViewport, setInViewport] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [isCaptionLoaded, setIsCaptionLoaded] = useState<boolean>(false);
  const [caption, setCaption] = useState<string>('');
  const [savedCaption, setSavedCaption] = useState<string>('');
  const isGettingCaption = useRef<boolean>(false);
  const [isGeneratingAiCaption, setIsGeneratingAiCaption] = useState(false);

  const generateAiCaption = async () => {
    if (isGeneratingAiCaption) return;
    setIsGeneratingAiCaption(true);
    try {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/claude/caption', {
        method: 'POST',
        headers,
        body: JSON.stringify({ imagePath: imageUrl, style: 'descriptive' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.caption) {
          setCaption(data.caption);
          // Auto-save the generated caption to disk
          const trimmed = data.caption.trim();
          apiClient
            .post('/api/img/caption', { imgPath: imageUrl, caption: trimmed })
            .then(() => setSavedCaption(trimmed))
            .catch(err => console.error('Error auto-saving AI caption:', err));
        }
      }
    } catch (err) {
      console.error('Error generating AI caption:', err);
    } finally {
      setIsGeneratingAiCaption(false);
    }
  };

  const fetchCaption = async () => {
    if (isGettingCaption.current || isCaptionLoaded) return;
    isGettingCaption.current = true;
    apiClient
      .post(proxyApiPath('/api/caption/get', hostId), { imgPath: imageUrl })
      .then(res => res.data)
      .then(data => {
        if (data) {
          // fix issue where caption could be non string
          data = `${data}`;
        }
        setCaption(data || '');
        setSavedCaption(data || '');
        setIsCaptionLoaded(true);
      })
      .catch(error => {
        console.error('Error fetching caption:', error);
      })
      .finally(() => {
        isGettingCaption.current = false;
      });
  };

  const saveCaption = () => {
    if (isRemote) return; // Read-only for remote
    const trimmedCaption = caption.trim();
    if (trimmedCaption === savedCaption) return;
    apiClient
      .post('/api/img/caption', { imgPath: imageUrl, caption: trimmedCaption })
      .then(res => res.data)
      .then(data => {
        setSavedCaption(trimmedCaption);
      })
      .catch(error => {
        console.error('Error saving caption:', error);
      });
  };

  // Only fetch caption when the component is both in viewport and visible
  useEffect(() => {
    if (inViewport && isVisible) {
      fetchCaption();
    }
  }, [inViewport, isVisible]);

  useEffect(() => {
    // Create intersection observer to check viewport visibility
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setInViewport(true);
          // Initialize isVisible to true when first coming into view
          if (!isVisible) {
            setIsVisible(true);
          }
        } else {
          setInViewport(false);
        }
      },
      { threshold: 0.1 },
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const toggleVisibility = (): void => {
    setIsVisible(prev => !prev);
    if (!isVisible && !isCaptionLoaded) {
      fetchCaption();
    }
  };

  const handleLoad = (): void => {
    setLoaded(true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // If Enter is pressed without Shift, prevent default behavior and save
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveCaption();
    }
  };

  const isCaptionCurrent = caption.trim() === savedCaption;

  const isItAVideo = isVideo(imageUrl);
  const isItAudio = isAudio(imageUrl);
  const isItImage = !isItAVideo && !isItAudio;

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Square image container */}
      <div
        ref={cardRef}
        className="relative w-full"
        style={{ paddingBottom: '100%' }} // Make it square
      >
        <div className="absolute inset-0 rounded-t-lg shadow-md">
          {inViewport && isVisible && (
            <>
              {isItAVideo && (
                <video
                  src={proxyApiPath(`/api/img/${encodeURIComponent(imageUrl)}`, hostId)}
                  className={`w-full h-full object-contain`}
                  autoPlay={false}
                  loop
                  muted
                  controls
                />
              )}
              {isItAudio && (
                <AudioPlayer
                  src={proxyApiPath(`/api/img/${encodeURIComponent(imageUrl)}`, hostId)}
                  title={imageUrl.replace(/^.*[\\/]/, '')}
                />
              )}
              {isItImage && (
                <img
                  src={proxyApiPath(`/api/img/${encodeURIComponent(imageUrl)}`, hostId)}
                  alt={alt}
                  onLoad={handleLoad}
                  className={`w-full h-full object-contain transition-opacity duration-300 ${
                    loaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              )}
            </>
          )}
          {!isVisible && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 rounded-t-lg">
              <span className="text-white text-lg"></span>
            </div>
          )}
          {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
          <div className="absolute top-1 right-1 flex space-x-2 z-10">
            {showAiCaption && isItImage && !isRemote && (
              <button
                className="bg-gray-800 rounded-full p-2 text-purple-400 hover:text-purple-300 transition-colors"
                onClick={generateAiCaption}
                disabled={isGeneratingAiCaption}
                title="Generate caption with Claude"
                aria-label="Generate caption with Claude"
              >
                {isGeneratingAiCaption ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </button>
            )}
            {!isRemote && onDelete && (
              <button
                className="bg-gray-800 rounded-full p-2"
                aria-label={`Delete ${isItAVideo ? 'video' : 'image'}`}
                onClick={() => {
                  openConfirm({
                    title: `Delete ${isItAVideo ? 'video' : 'image'}`,
                    message: `Are you sure you want to delete this ${isItAVideo ? 'video' : 'image'}? This action cannot be undone.`,
                    type: 'warning',
                    confirmText: 'Delete',
                    onConfirm: () => {
                      apiClient
                        .post('/api/img/delete', { imgPath: imageUrl })
                        .then(() => {
                          onDelete();
                        })
                        .catch(error => {
                          console.error('Error deleting image:', error);
                        });
                    },
                  });
                }}
              >
                <FaTrashAlt />
              </button>
            )}
          </div>
        </div>
        {inViewport && isVisible && !isItAudio && (
          <div className="text-xs text-gray-100 bg-gray-950 mt-1 absolute bottom-0 left-0 p-1 opacity-25 hover:opacity-90 transition-opacity duration-300 w-full">
            {imageUrl}
          </div>
        )}
      </div>
      <div
        className={classNames('w-full p-2 bg-gray-800 text-white text-sm rounded-b-lg h-[75px]', {
          'border-blue-500 border-2': !isCaptionCurrent,
          'border-transparent border-2': isCaptionCurrent,
        })}
      >
        {inViewport && isVisible && isCaptionLoaded && !isRemote && (
          <form
            onSubmit={e => {
              e.preventDefault();
              saveCaption();
            }}
            onBlur={saveCaption}
          >
            <textarea
              className="w-full bg-transparent resize-none outline-none focus:ring-0 focus:outline-none"
              value={caption}
              rows={3}
              onChange={e => setCaption(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </form>
        )}
        {inViewport && isVisible && isCaptionLoaded && isRemote && (
          <div className="w-full text-gray-300 text-xs overflow-y-auto h-full">
            {caption || <span className="text-gray-500 italic">No caption</span>}
          </div>
        )}
        {(!inViewport || !isVisible) && isCaptionLoaded && (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            {isVisible ? 'Scroll into view to edit caption' : 'Show content to edit caption'}
          </div>
        )}
        {!isCaptionLoaded && (
          <div className="w-full h-full flex items-center justify-center text-gray-400">Loading caption...</div>
        )}
      </div>
    </div>
  );
};

export default DatasetImageCard;
