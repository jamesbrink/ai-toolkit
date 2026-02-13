'use client';

import React, { forwardRef } from 'react';
import clsx from 'clsx';
import { CircleHelp } from 'lucide-react';
import { getDoc } from '@/docs';
import { openDoc } from '@/components/DocModal';
import { Input } from '@/components/catalyst/input';
import { Select } from '@/components/catalyst/select';
import { Switch } from '@/components/catalyst/switch';
import { Field, Label, Fieldset, Legend } from '@/components/catalyst/fieldset';
import { ConfigDoc, GroupedSelectOption, SelectOption } from '@/types';

function DocIcon({ doc }: { doc: ConfigDoc }) {
  return (
    <span
      className="inline-flex ml-1 text-zinc-500 dark:text-zinc-400 cursor-pointer"
      onClick={() => openDoc(doc)}
    >
      <CircleHelp className="inline-block w-4 h-4" />
    </span>
  );
}

export interface InputProps {
  label?: string;
  docKey?: string | null;
  doc?: ConfigDoc | null;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

export interface TextInputProps extends InputProps {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
  disabled?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>((props: TextInputProps, ref) => {
  const { label, value, onChange, placeholder, required, disabled, type = 'text', className, docKey = null } = props;
  let { doc } = props;
  if (!doc && docKey) {
    doc = getDoc(docKey);
  }
  return (
    <Field className={clsx(className)} disabled={disabled}>
      {label && (
        <Label className="text-xs mb-1.5 mt-3">
          {label} {doc && <DocIcon doc={doc} />}
        </Label>
      )}
      <Input
        ref={ref}
        type={type}
        value={value}
        onChange={e => {
          if (!disabled) onChange(e.target.value);
        }}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
    </Field>
  );
});

TextInput.displayName = 'TextInput';

export interface NumberInputProps extends InputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
}

export const NumberInput = (props: NumberInputProps) => {
  const { label, value, onChange, placeholder, required, min, max, docKey = null } = props;
  let { doc } = props;
  if (!doc && docKey) {
    doc = getDoc(docKey);
  }

  const [inputValue, setInputValue] = React.useState<string | number>(value ?? '');

  React.useEffect(() => {
    setInputValue(value ?? '');
  }, [value]);

  return (
    <Field className={clsx(props.className)}>
      {label && (
        <Label className="text-xs mb-1.5 mt-3">
          {label} {doc && <DocIcon doc={doc} />}
        </Label>
      )}
      <Input
        type="number"
        value={inputValue}
        onChange={e => {
          const rawValue = e.target.value;
          setInputValue(rawValue);

          if (rawValue === '' || rawValue === '-') {
            return;
          }

          const numValue = Number(rawValue);

          if (!isNaN(numValue)) {
            let constrainedValue = numValue;

            if (min !== undefined && constrainedValue < min) {
              constrainedValue = min;
            }
            if (max !== undefined && constrainedValue > max) {
              constrainedValue = max;
            }

            onChange(constrainedValue);
          }
        }}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step="any"
      />
    </Field>
  );
};

export interface SelectInputProps extends InputProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: (GroupedSelectOption | SelectOption)[];
}

export const SelectInput = (props: SelectInputProps) => {
  const { label, value, onChange, options, docKey = null } = props;
  let { doc } = props;
  if (!doc && docKey) {
    doc = getDoc(docKey);
  }
  return (
    <Field
      className={clsx(props.className)}
      disabled={props.disabled}
    >
      {label && (
        <Label className="text-xs mb-1.5 mt-3">
          {label} {doc && <DocIcon doc={doc} />}
        </Label>
      )}
      <Select
        value={value}
        disabled={props.disabled}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(opt =>
          'options' in opt ? (
            <optgroup key={opt.label} label={opt.label}>
              {(opt as GroupedSelectOption).options.map(sub => (
                <option key={sub.value} value={sub.value}>
                  {sub.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={(opt as SelectOption).value} value={(opt as SelectOption).value}>
              {(opt as SelectOption).label}
            </option>
          ),
        )}
      </Select>
    </Field>
  );
};

export interface CheckboxProps {
  label?: string | React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  docKey?: string | null;
  doc?: ConfigDoc | null;
}

export const Checkbox = (props: CheckboxProps) => {
  const { label, checked, onChange, disabled } = props;
  let { doc } = props;
  if (!doc && props.docKey) {
    doc = getDoc(props.docKey);
  }

  return (
    <div className={clsx('flex items-center gap-3', props.className)}>
      <Switch
        color="blue"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      {label && (
        <>
          <span
            className={clsx(
              'text-sm font-medium cursor-pointer select-none',
              disabled
                ? 'text-zinc-500 dark:text-zinc-400'
                : 'text-zinc-700 dark:text-zinc-300',
            )}
            onClick={() => !disabled && onChange(!checked)}
          >
            {label}
          </span>
          {doc && <DocIcon doc={doc} />}
        </>
      )}
    </div>
  );
};

interface FormGroupProps {
  label?: string;
  className?: string;
  docKey?: string | null;
  doc?: ConfigDoc | null;
  children: React.ReactNode;
}

export const FormGroup: React.FC<FormGroupProps> = props => {
  const { label, className, children, docKey = null } = props;
  let { doc } = props;
  if (!doc && docKey) {
    doc = getDoc(docKey);
  }
  return (
    <Fieldset className={clsx(className)}>
      {label && (
        <Legend className="text-xs mb-2 mt-3">
          {label} {doc && <DocIcon doc={doc} />}
        </Legend>
      )}
      <div className="space-y-2">{children}</div>
    </Fieldset>
  );
};

export interface SliderInputProps extends InputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  showValue?: boolean;
}

export const SliderInput: React.FC<SliderInputProps> = props => {
  const { label, value, onChange, min, max, step = 1, disabled, className, docKey = null, showValue = true } = props;
  let { doc } = props;
  if (!doc && docKey) {
    doc = getDoc(docKey);
  }

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const clamp = React.useCallback((v: number) => (v < min ? min : v > max ? max : v), [min, max]);
  const snapToStep = React.useCallback(
    (v: number) => {
      if (!Number.isFinite(v)) return min;
      const steps = Math.round((v - min) / step);
      const snapped = min + steps * step;
      return clamp(Number(snapped.toFixed(6)));
    },
    [min, step, clamp],
  );

  const percent = React.useMemo(() => {
    if (max === min) return 0;
    const p = ((value - min) / (max - min)) * 100;
    return p < 0 ? 0 : p > 100 ? 100 : p;
  }, [value, min, max]);

  const calcFromClientX = React.useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || !Number.isFinite(clientX)) return;
      const rect = el.getBoundingClientRect();
      const width = rect.right - rect.left;
      if (!(width > 0)) return;

      const ratioRaw = (clientX - rect.left) / width;
      const ratio = ratioRaw <= 0 ? 0 : ratioRaw >= 1 ? 1 : ratioRaw;

      const raw = min + ratio * (max - min);
      onChange(snapToStep(raw));
    },
    [min, max, onChange, snapToStep],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();

    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture not supported
    }

    setDragging(true);
    calcFromClientX(e.clientX);

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      calcFromClientX(moveEvent.clientX);
    };
    const handleUp = (_ev: PointerEvent) => {
      setDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // Pointer capture release not supported
      }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div className={clsx(className, disabled ? 'opacity-30 cursor-not-allowed' : '')}>
      {label && (
        <label className="block text-xs mb-1.5 mt-3 text-zinc-500 dark:text-zinc-400">
          {label} {doc && <DocIcon doc={doc} />}
        </label>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div
            ref={trackRef}
            onPointerDown={onPointerDown}
            className={clsx(
              'relative w-full h-6 select-none outline-none',
              disabled ? 'pointer-events-none' : 'cursor-pointer',
            )}
          >
            {/* Track */}
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-3 rounded-sm bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700" />

            {/* Fill */}
            <div
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-3 rounded-sm bg-blue-600"
              style={{ width: `${percent}%` }}
            />

            {/* Thumb */}
            <div
              onPointerDown={onPointerDown}
              className={clsx(
                'absolute top-1/2 -translate-y-1/2 -ml-2',
                'h-4 w-4 rounded-full bg-white shadow border border-zinc-300 cursor-pointer',
                'after:content-[""] after:absolute after:inset-[-6px] after:rounded-full after:bg-transparent',
                dragging ? 'ring-2 ring-blue-600' : '',
              )}
              style={{ left: `calc(${percent}% )` }}
            />
          </div>

          <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 select-none">
            <span>{min}</span>
            <span>{max}</span>
          </div>
        </div>

        {showValue && (
          <div className="min-w-[3.5rem] text-right text-sm px-3 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-sm text-zinc-900 dark:text-zinc-100">
            {Number.isFinite(value) ? value : ''}
          </div>
        )}
      </div>
    </div>
  );
};
