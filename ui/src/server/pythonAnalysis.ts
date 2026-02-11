import { spawn } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { TOOLKIT_ROOT } from '@/paths';

/**
 * Discover the Python binary using the same logic as the cron worker.
 * PYTHON_PATH env → .venv/bin/python → venv/bin/python → python
 */
function getPythonPath(): string {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;

  const isWindows = process.platform === 'win32';
  const venvDirs = ['.venv', 'venv'];
  for (const dir of venvDirs) {
    const venvPath = path.join(TOOLKIT_ROOT, dir);
    if (fs.existsSync(venvPath)) {
      return isWindows ? path.join(venvPath, 'Scripts', 'python.exe') : path.join(venvPath, 'bin', 'python');
    }
  }
  return 'python';
}

export interface PythonAnalysisResult {
  type: string;
  [key: string]: unknown;
}

export interface PythonAnalysisCallbacks {
  onResult?: (result: PythonAnalysisResult) => void;
  onProgress?: (current: number, total: number) => void;
  onError?: (error: string, filePath?: string) => void;
}

/**
 * Run the Python dataset_analysis.py script and stream NDJSON results.
 *
 * @param mode - 'analyze' or 'face-crop'
 * @param imagePaths - Array of absolute image paths
 * @param options - Extra CLI args (output-dir, training-resolution, padding)
 * @param callbacks - Handlers for results, progress, errors
 * @returns The final summary object from the Python script
 */
export async function runPythonAnalysis(
  mode: 'analyze' | 'face-crop',
  imagePaths: string[],
  options: {
    outputDir?: string;
    trainingResolution?: number;
    padding?: number;
  } = {},
  callbacks: PythonAnalysisCallbacks = {},
): Promise<PythonAnalysisResult> {
  // Write image paths to a temp file
  const tmpFile = path.join(os.tmpdir(), `aitk-analysis-${Date.now()}.txt`);
  await fsp.writeFile(tmpFile, imagePaths.join('\n'), 'utf-8');

  const pythonPath = getPythonPath();
  const scriptPath = path.join(TOOLKIT_ROOT, 'toolkit', 'dataset_analysis.py');

  const args = [scriptPath, '--mode', mode, '--images-file', tmpFile];

  if (options.trainingResolution) {
    args.push('--training-resolution', String(options.trainingResolution));
  }
  if (mode === 'face-crop') {
    if (options.outputDir) {
      args.push('--output-dir', options.outputDir);
    }
    if (options.padding) {
      args.push('--padding', String(options.padding));
    }
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, args, {
      cwd: TOOLKIT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';
    let stderrBuffer = '';
    let summary: PythonAnalysisResult | null = null;

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed) as PythonAnalysisResult;
          if (data.type === 'progress') {
            callbacks.onProgress?.(data.current as number, data.total as number);
          } else if (data.type === 'error') {
            callbacks.onError?.(data.error as string, data.filePath as string | undefined);
          } else if (data.type === 'summary') {
            summary = data;
          } else {
            callbacks.onResult?.(data);
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf-8');
    });

    proc.on('close', async code => {
      // Clean up temp file
      try {
        await fsp.unlink(tmpFile);
      } catch {
        /* ignore */
      }

      if (code !== 0) {
        reject(new Error(`Python analysis exited with code ${code}: ${stderrBuffer.slice(-500)}`));
        return;
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim()) as PythonAnalysisResult;
          if (data.type === 'summary') summary = data;
        } catch {
          /* ignore */
        }
      }

      resolve(summary || { type: 'summary', total: 0 });
    });

    proc.on('error', async err => {
      try {
        await fsp.unlink(tmpFile);
      } catch {
        /* ignore */
      }
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });
  });
}
