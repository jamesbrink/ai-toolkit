'use client';
import { useRef } from 'react';
import { useState, useEffect } from 'react';
import { createGlobalState } from 'react-global-hooks';
import { FaExclamationTriangle, FaInfo } from 'react-icons/fa';
import { TextInput } from './formInputs';
import { useFromNull } from '@/hooks/useFromNull';
import clsx from 'clsx';
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';

export interface ConfirmState {
  title: string;
  message?: string;
  confirmText?: string;
  type?: 'danger' | 'warning' | 'info';
  inputTitle?: string;
  defaultInputValue?: string;
  onConfirm?: (value?: string) => void | Promise<void>;
  onCancel?: () => void;
}

export const confirmstate = createGlobalState<ConfirmState | null>(null);

export const openConfirm = (confirmProps: ConfirmState) => {
  confirmstate.set(confirmProps);
};

const colorToButton: Record<string, 'red' | 'yellow' | 'blue'> = {
  danger: 'red',
  warning: 'yellow',
  info: 'blue',
};

const iconBgColor: Record<string, string> = {
  danger: 'bg-red-100 dark:bg-red-500/20',
  warning: 'bg-yellow-100 dark:bg-yellow-500/20',
  info: 'bg-blue-100 dark:bg-blue-500/20',
};

const iconTextColor: Record<string, string> = {
  danger: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400',
};

export default function ConfirmModal() {
  const [confirm, setConfirm] = confirmstate.use();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useFromNull(() => {
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
  }, [confirm]);

  useEffect(() => {
    if (confirm) {
      setIsOpen(true);
      setInputValue(confirm.defaultInputValue ?? '');
    }
  }, [confirm]);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setConfirm(null);
      }, 500);
    }
  }, [isOpen, setConfirm]);

  const onCancel = () => {
    if (confirm?.onCancel) {
      confirm.onCancel();
    }
    setIsOpen(false);
  };

  const onConfirm = () => {
    if (confirm?.onConfirm) {
      confirm.onConfirm(inputValue);
    }
    setIsOpen(false);
  };

  const color = confirm?.type || 'danger';
  const Icon = color === 'info' ? FaInfo : FaExclamationTriangle;

  return (
    <Dialog open={isOpen} onClose={onCancel} size="lg">
      <div className="sm:flex sm:items-start">
        <div
          className={clsx(
            'mx-auto flex size-12 shrink-0 items-center justify-center rounded-full sm:mx-0 sm:size-10',
            iconBgColor[color],
          )}
        >
          <Icon aria-hidden="true" className={clsx('size-6', iconTextColor[color])} />
        </div>
        <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
          <DialogTitle>{confirm?.title}</DialogTitle>
          <DialogBody>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{confirm?.message}</p>
            <div className={clsx('mt-4 w-full', { hidden: !confirm?.inputTitle })}>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  onConfirm();
                }}
              >
                <TextInput
                  value={inputValue}
                  ref={inputRef}
                  onChange={setInputValue}
                  placeholder={confirm?.inputTitle}
                />
              </form>
            </div>
          </DialogBody>
        </div>
      </div>
      <DialogActions>
        <Button plain onClick={onCancel}>
          Cancel
        </Button>
        <Button color={colorToButton[color]} onClick={onConfirm}>
          {confirm?.confirmText || 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
