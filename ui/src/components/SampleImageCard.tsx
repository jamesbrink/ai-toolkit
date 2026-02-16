import React, { useRef, useEffect, useState, ReactNode } from 'react';
import { isVideo } from '@/utils/basic';
import { LuTrash2 } from 'react-icons/lu';

interface SampleImageCardProps {
  imageUrl: string;
  alt: string;
  numSamples: number;
  sampleImages: string[];
  children?: ReactNode;
  className?: string;
  onDelete?: () => void;
  onClick?: () => void;
  /** pass your scroll container element (e.g. containerRef.current) */
  observerRoot?: Element | null;
  /** optional: tweak pre-load buffer */
  rootMargin?: string; // default '200px 0px'
  /** base URL for images, e.g. '/api/img/' or '/api/hosts/{id}/proxy/img/' */
  imageBaseUrl?: string;
}

const SampleImageCard: React.FC<SampleImageCardProps> = ({
  imageUrl,
  alt,
  children,
  className = '',
  onDelete,
  onClick = () => {},
  observerRoot = null,
  rootMargin = '200px 0px',
  imageBaseUrl = '/api/img/',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Observe both enter and exit
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.target === el) {
            setIsVisible(entry.isIntersecting);
          }
        }
      },
      {
        root: observerRoot ?? null,
        threshold: 0.01,
        rootMargin,
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [observerRoot, rootMargin]);

  const handleLoad = () => setLoaded(true);

  return (
    <div className={`flex flex-col ${className}`}>
      <div
        ref={cardRef}
        className="group relative w-full cursor-pointer"
        style={{ paddingBottom: '100%' }}
        onClick={onClick}
      >
        <div className="absolute inset-0 rounded-t-lg shadow-md">
          {isVisible ? (
            isVideo(imageUrl) ? (
              <video
                ref={videoRef}
                src={`${imageBaseUrl}${encodeURIComponent(imageUrl)}`}
                className="w-full h-full object-cover"
                preload="none"
                onLoadedData={handleLoad}
                playsInline
                muted
                loop
                autoPlay
                controls={false}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- dynamic API-served sample image; next/image optimization not applicable */
              <img
                src={`${imageBaseUrl}${encodeURIComponent(imageUrl)}`}
                alt={alt}
                onLoad={handleLoad}
                loading="lazy"
                decoding="async"
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  loaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )
          ) : null}

          {children && isVisible && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
          {onDelete && isVisible && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onDelete();
              }}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Delete sample"
            >
              <LuTrash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SampleImageCard;
