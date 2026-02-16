'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { NumberInput } from '@/components/formInputs';
import { Job } from '@/server/prismaTypes';
import { UnifiedJob, JobConfig } from '@/types';
import { getConfigOverrides, setConfigOverrides } from '@/utils/jobs';
import { AlertTriangle } from 'lucide-react';

interface LiveConfigPanelProps {
  job: Job | UnifiedJob;
  isOpen: boolean;
  onClose: () => void;
}

interface OverrideField {
  key: string;
  label: string;
  configPath: string;
  min?: number;
  step?: number;
}

const OVERRIDE_FIELDS: OverrideField[] = [
  { key: 'sample_every', label: 'Sample Every (steps)', configPath: 'sample.sample_every', min: 1 },
  { key: 'save_every', label: 'Save Every (steps)', configPath: 'save.save_every', min: 1 },
  { key: 'log_every', label: 'Log Every (steps)', configPath: 'logging.log_every', min: 1 },
  { key: 'lr', label: 'Learning Rate', configPath: 'train.lr', min: 0, step: 0.000001 },
  { key: 'cfg_scale', label: 'CFG Scale', configPath: 'train.cfg_scale', min: 0, step: 0.1 },
  { key: 'gradient_accumulation', label: 'Gradient Accumulation', configPath: 'train.gradient_accumulation', min: 1 },
];

function getConfigValue(config: JobConfig | null, path: string): number | null {
  if (!config) return null;
  const [section, field] = path.split('.');
  const process = config.config?.process?.[0];
  if (!process) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sectionObj = (process as any)[section];
  if (!sectionObj || typeof sectionObj !== 'object') return null;
  const val = sectionObj[field];
  return typeof val === 'number' ? val : null;
}

function getLrScheduler(config: JobConfig | null): string {
  if (!config) return 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (config.config?.process?.[0]?.train as any)?.lr_scheduler ?? 'constant';
}

export default function LiveConfigPanel({ job, isOpen, onClose }: LiveConfigPanelProps) {
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [activeOverrides, setActiveOverrides] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Stabilize jobConfig to avoid re-parsing on every render
  const jobConfig: JobConfig | null = useMemo(() => {
    try {
      return JSON.parse(job.job_config) as JobConfig;
    } catch {
      return null;
    }
  }, [job.job_config]);

  const lrScheduler = getLrScheduler(jobConfig);
  const showLrWarning = lrScheduler !== 'constant';

  // Load current overrides from DB — only when panel opens
  const loadOverrides = useCallback(async () => {
    const overrides = await getConfigOverrides(job.id);
    setActiveOverrides(overrides);

    const initial: Record<string, number | null> = {};
    for (const field of OVERRIDE_FIELDS) {
      const overrideVal = overrides[field.key];
      if (overrideVal !== undefined) {
        initial[field.key] = overrideVal;
      } else {
        initial[field.key] = getConfigValue(jobConfig, field.configPath);
      }
    }
    setValues(initial);
  }, [job.id, jobConfig]);

  useEffect(() => {
    if (isOpen) {
      loadOverrides();
    }
  }, [isOpen, loadOverrides]);

  const handleApply = async () => {
    setSaving(true);
    try {
      const overrides: Record<string, number> = {};
      for (const field of OVERRIDE_FIELDS) {
        const val = values[field.key];
        if (val === null || val === undefined) continue;
        const originalVal = getConfigValue(jobConfig, field.configPath);
        if (val !== originalVal || activeOverrides[field.key] !== undefined) {
          overrides[field.key] = val;
        }
      }

      if (Object.keys(overrides).length > 0) {
        await setConfigOverrides(job.id, overrides);
        setActiveOverrides(overrides);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>Live Config Tuning</DialogTitle>
      <DialogBody>
        <p className="text-sm text-gray-400 mb-4">
          Changes take effect within ~10 training steps. Active overrides are cleared when the job is restarted.
        </p>

        {showLrWarning && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-xs text-yellow-400">
              This job uses the <strong>{lrScheduler}</strong> LR scheduler. Overriding the learning rate will be
              overwritten by the scheduler on each step. LR override works cleanly only with the{' '}
              <strong>constant</strong> scheduler.
            </p>
          </div>
        )}

        <div className="space-y-1">
          {OVERRIDE_FIELDS.map(field => {
            const isOverridden = activeOverrides[field.key] !== undefined;
            const originalVal = getConfigValue(jobConfig, field.configPath);

            return (
              <div key={field.key} className="relative">
                <NumberInput
                  label={field.label}
                  value={values[field.key] ?? null}
                  onChange={val => setValues(prev => ({ ...prev, [field.key]: val }))}
                  min={field.min}
                />
                {isOverridden && (
                  <span className="absolute top-3 right-0 text-[10px] text-blue-400">
                    original: {originalVal}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button color="blue" onClick={handleApply} disabled={saving}>
          {saving ? 'Applying...' : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
