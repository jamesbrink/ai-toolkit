import path from 'path';
import fs from 'fs';
import { getTrainingFolder } from '../paths';

/**
 * Scan the training output folder for checkpoint files/directories and return
 * the highest step number found.  Returns `null` when no checkpoints exist.
 *
 * Checkpoint naming convention (9-digit zero-padded step):
 *   {jobName}_{step}.safetensors          — regular saves
 *   {jobName}_LoRA_{step}.safetensors     — named LoRA saves
 *   {jobName}_{step}/                     — diffusers format directories
 */
export async function findLatestCheckpointStep(
  jobName: string,
  trainingRoot?: string,
): Promise<number | null> {
  const root = trainingRoot ?? (await getTrainingFolder());
  const saveRoot = path.join(root, jobName);

  if (!fs.existsSync(saveRoot)) {
    return null;
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(saveRoot);
  } catch {
    return null;
  }

  // Match: {jobName}_{digits}.safetensors, {jobName}_LoRA_{digits}.safetensors, {jobName}_{digits} (dir)
  const stepRegex = new RegExp(`^${escapeRegex(jobName)}(?:_LoRA)?_(\\d{9})(?:\\.safetensors)?$`);

  let maxStep: number | null = null;

  for (const entry of entries) {
    const match = entry.match(stepRegex);
    if (!match) continue;

    const fullPath = path.join(saveRoot, entry);
    const isFile = entry.endsWith('.safetensors');
    const isDir = !isFile && fs.statSync(fullPath).isDirectory();

    if (!isFile && !isDir) continue;

    const step = parseInt(match[1], 10);
    if (maxStep === null || step > maxStep) {
      maxStep = step;
    }
  }

  return maxStep;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
