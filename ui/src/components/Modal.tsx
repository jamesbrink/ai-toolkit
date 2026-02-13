import React from 'react';
import { Dialog, DialogTitle, DialogBody } from '@/components/catalyst/dialog';

const sizeMap = {
  sm: 'sm' as const,
  md: 'md' as const,
  lg: 'lg' as const,
  xl: 'xl' as const,
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnOverlayClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true,
  size = 'md',
}) => {
  return (
    <Dialog open={isOpen} onClose={onClose} size={sizeMap[size]}>
      {(title || showCloseButton) && (
        <div className="flex items-center justify-between mb-4">
          {title && <DialogTitle>{title}</DialogTitle>}
          {showCloseButton && (
            <button
              type="button"
              className="ml-auto inline-flex items-center justify-center rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={onClose}
              aria-label="Close modal"
            >
              <svg
                className="h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}
      <DialogBody>{children}</DialogBody>
    </Dialog>
  );
};
