import { describe, it, expect } from 'vitest';
import { getJobConfig, getAvaliableJobActions, getTotalSteps } from '../jobs';

// Minimal mock job factory
function makeJob(overrides: Record<string, any> = {}) {
  const defaults = {
    id: 'test-id',
    name: 'test-job',
    gpu_ids: '0',
    job_config: JSON.stringify({
      config: {
        process: [
          {
            train: { steps: 1000 },
            sample: { prompts: ['a cat', 'a dog'] },
          },
        ],
      },
    }),
    created_at: new Date(),
    updated_at: new Date(),
    status: 'stopped',
    stop: false,
    return_to_queue: false,
    step: 0,
    info: '',
    speed_string: '',
    queue_position: 0,
  };
  return { ...defaults, ...overrides };
}

describe('getJobConfig', () => {
  it('parses job_config JSON', () => {
    const job = makeJob();
    const config = getJobConfig(job);
    expect(config.config.process[0].train.steps).toBe(1000);
  });
});

describe('getAvaliableJobActions', () => {
  it('stopped job: can start and delete, cannot stop', () => {
    const job = makeJob({ status: 'stopped' });
    const actions = getAvaliableJobActions(job);
    expect(actions.canStart).toBe(true);
    expect(actions.canDelete).toBe(true);
    expect(actions.canStop).toBe(false);
  });

  it('running job: can stop, cannot start or delete', () => {
    const job = makeJob({ status: 'running' });
    const actions = getAvaliableJobActions(job);
    expect(actions.canStop).toBe(true);
    expect(actions.canStart).toBe(false);
    expect(actions.canDelete).toBe(false);
  });

  it('running job with stop flag: all actions disabled', () => {
    const job = makeJob({ status: 'running', stop: true });
    const actions = getAvaliableJobActions(job);
    expect(actions.canStop).toBe(false);
    expect(actions.canStart).toBe(false);
    expect(actions.canDelete).toBe(false);
  });

  it('completed job: can delete, cannot start if at max steps', () => {
    const job = makeJob({ status: 'completed', step: 1000 });
    const actions = getAvaliableJobActions(job);
    expect(actions.canDelete).toBe(true);
    expect(actions.canStart).toBe(false);
  });

  it('completed job: can resume if more steps added', () => {
    const job = makeJob({ status: 'completed', step: 500 });
    const actions = getAvaliableJobActions(job);
    expect(actions.canStart).toBe(true);
  });

  it('queued job: can remove from queue, cannot stop', () => {
    const job = makeJob({ status: 'queued' });
    const actions = getAvaliableJobActions(job);
    expect(actions.canRemoveFromQueue).toBe(true);
    expect(actions.canStop).toBe(false);
  });

  it('error job: can start and delete', () => {
    const job = makeJob({ status: 'error' });
    const actions = getAvaliableJobActions(job);
    expect(actions.canStart).toBe(true);
    expect(actions.canDelete).toBe(true);
  });
});

describe('getTotalSteps', () => {
  it('returns steps from job config', () => {
    const job = makeJob();
    expect(getTotalSteps(job)).toBe(1000);
  });
});
