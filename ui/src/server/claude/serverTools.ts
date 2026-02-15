import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import prisma from '@/server/prisma';
import { TOOLKIT_ROOT } from '@/paths';
import { getDatasetsRoot, getTrainingFolder, getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeCaptionModel } from '@/server/claude/client';
import { analyzeDataset, getStoredAnalysis, deleteAnalyzedImages } from '@/server/datasetAnalysis';
import { runPythonAnalysis } from '@/server/pythonAnalysis';
import { recordUsage } from '@/server/claude/usageTracker';
import {
  deployPod,
  deploySpotPod,
  getPod,
  stopPod,
  resumePod,
  terminatePod,
  listGpuTypes,
  getAccountInfo,
} from '@/server/runpod';
import type { DeployPodInput, DeploySpotPodInput } from '@/server/runpod';

// Tool definitions sent to the Claude API
export const serverToolDefinitions = [
  {
    name: 'read_file',
    description:
      'Read the contents of a file. Use this to inspect training configs, source code, caption files, or dataset metadata. Paths must be under the toolkit source, datasets, or training output directories.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to read' },
        max_lines: {
          type: 'number',
          description: 'Maximum number of lines to return (default 200)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description:
      'List the contents of a directory. Use this to explore dataset folders, config directories, or training output. Paths must be under the toolkit source, datasets, or training output directories.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory' },
        pattern: {
          type: 'string',
          description: 'Optional glob-like suffix filter (e.g. ".txt", ".yaml", ".png")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write content to a file. Use this to create or update caption .txt files, training configs, or other files in the datasets or training output directories. Cannot write to toolkit source code (may be read-only). Creates parent directories if needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to write' },
        content: { type: 'string', description: 'Content to write to the file' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'analyze_dataset_quality',
    description:
      'Analyze a dataset for image quality issues, near-duplicate images, and face detection. Uses OpenCV for accurate blur detection (Laplacian variance), brightness, contrast analysis, and YuNet DNN face detection. Returns a summary of duplicates, blurry, dark, bright, low-contrast, and too-small images with quality scores, plus face counts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dataset_name: { type: 'string', description: 'Name of the dataset to analyze' },
        force: {
          type: 'boolean',
          description: 'Force re-analysis of all images even if unchanged',
        },
      },
      required: ['dataset_name'],
    },
  },
  {
    name: 'get_dataset_issues',
    description: 'Get stored quality analysis results for a dataset, optionally filtered by issue type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dataset_name: { type: 'string', description: 'Name of the dataset' },
        issue_type: {
          type: 'string',
          description:
            'Filter by issue type: all, duplicates, blurry, dark, bright, small, low_contrast, faces (default: all)',
        },
      },
      required: ['dataset_name'],
    },
  },
  {
    name: 'view_dataset_image',
    description:
      'View a specific dataset image using vision to describe what you see. Returns a detailed description of the image content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_path: { type: 'string', description: 'Absolute path to the image file' },
        question: {
          type: 'string',
          description: 'Specific question about the image (default: describe the image in detail)',
        },
      },
      required: ['image_path'],
    },
  },
  {
    name: 'crop_faces',
    description:
      'Crop detected faces from a dataset and create a new sibling dataset with face crops. Each face gets a square crop with padding (default 1.8x) that includes head, hair, neck, and shoulders — ideal for LoRA person training. Requires running analyze_dataset_quality first to detect faces.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dataset_name: { type: 'string', description: 'Name of the source dataset' },
        output_dataset_name: {
          type: 'string',
          description: 'Name for the output dataset (default: {dataset_name}_faces)',
        },
        training_resolution: {
          type: 'number',
          description: 'Resolution to resize face crops to (default: 512)',
        },
        padding: {
          type: 'number',
          description: 'Padding multiplier around face bounding box (default: 1.8)',
        },
      },
      required: ['dataset_name'],
    },
  },
  {
    name: 'delete_dataset_images',
    description:
      'Delete images from a dataset. Also removes associated caption .txt files and analysis data. Use this to clean up duplicates and low-quality images. Paths must be under the datasets directory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_paths: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Array of absolute paths to images to delete',
        },
        reason: {
          type: 'string',
          description: 'Brief explanation of why these images are being deleted (logged for the user)',
        },
      },
      required: ['image_paths', 'reason'],
    },
  },
  {
    name: 'list_jobs',
    description:
      'List all training jobs with their status, step count, speed, and GPU assignment. Returns a JSON array of job summaries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status_filter: {
          type: 'string',
          description: 'Optional filter by status: stopped, queued, running, completed, error (default: all)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'create_job',
    description:
      'Create a new training job with a name, config (YAML string), and GPU assignment. The job is created in "stopped" status — use start_job to queue it for execution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Unique name for the job' },
        job_config: { type: 'string', description: 'Training config as a YAML or JSON string' },
        gpu_ids: { type: 'string', description: 'GPU IDs to assign (e.g. "0", "0,1", "mps")' },
      },
      required: ['name', 'job_config', 'gpu_ids'],
    },
  },
  {
    name: 'start_job',
    description:
      'Queue a job for execution by setting its status to "queued" and ensuring its GPU queue exists. The cron worker will pick it up and start training.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string', description: 'ID of the job to start' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'list_datasets',
    description:
      'List all available datasets with image and caption file counts. Scans the datasets directory for folders containing images.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_job_config',
    description:
      'Get the full training configuration for a job. Look up by job ID or job name. Returns the parsed YAML/JSON config that was used or will be used for training.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string', description: 'ID of the job (optional if job_name provided)' },
        job_name: { type: 'string', description: 'Name of the job (optional if job_id provided)' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'stop_job',
    description:
      'Stop a running or queued training job. Sets the stop flag so the training process will gracefully shut down after the current step.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string', description: 'ID of the job to stop' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'compare_jobs',
    description:
      'Compare two training jobs side-by-side. Shows differences in their configurations, plus status, step count, and speed for each.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id_a: { type: 'string', description: 'ID of the first job' },
        job_id_b: { type: 'string', description: 'ID of the second job' },
      },
      required: ['job_id_a', 'job_id_b'],
    },
  },
  {
    name: 'analyze_samples',
    description:
      'Analyze the most recent sample images from a training job using vision AI. Returns descriptions of each sample to help evaluate training progress and quality.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string', description: 'ID of the training job' },
        count: { type: 'number', description: 'Number of most recent samples to analyze (default: 4)' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'list_runpod_pods',
    description: 'List all active (non-terminated) RunPod pods with their status, GPU type, cost, and connection info.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'deploy_runpod_pod',
    description:
      'Deploy a new RunPod GPU pod running AI Toolkit. This will incur real costs on the RunPod account. Returns pod info with cost details.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the pod' },
        gpu_type_id: { type: 'string', description: 'GPU type ID (e.g. "NVIDIA RTX 4090")' },
        cloud_type: {
          type: 'string',
          description: 'Cloud type: "COMMUNITY" or "SECURE" (default: "COMMUNITY")',
        },
        instance_type: {
          type: 'string',
          description:
            'Instance type: "ON_DEMAND" or "SPOT" (default: "ON_DEMAND"). Spot instances are cheaper but can be interrupted.',
        },
        volume_gb: {
          type: 'number',
          description: 'Volume size in GB for persistent storage (default: 50)',
        },
      },
      required: ['name', 'gpu_type_id'],
    },
  },
  {
    name: 'get_runpod_pod_status',
    description: 'Get detailed status of a RunPod pod including connection info, uptime, and cost.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pod_id: { type: 'string', description: 'Local database ID of the pod' },
      },
      required: ['pod_id'],
    },
  },
  {
    name: 'stop_runpod_pod',
    description:
      'Stop a running RunPod pod. The pod will be stopped but not terminated — storage is preserved and it can be resumed later.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pod_id: { type: 'string', description: 'Local database ID of the pod' },
      },
      required: ['pod_id'],
    },
  },
  {
    name: 'resume_runpod_pod',
    description: 'Resume a stopped RunPod pod. The pod will start back up with its existing volume and configuration.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pod_id: { type: 'string', description: 'Local database ID of the pod' },
      },
      required: ['pod_id'],
    },
  },
  {
    name: 'terminate_runpod_pod',
    description:
      'Permanently terminate a RunPod pod and delete its volume. This is irreversible — all data on the pod will be lost. Requires confirm: true.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pod_id: { type: 'string', description: 'Local database ID of the pod' },
        confirm: { type: 'boolean', description: 'Must be true to confirm termination' },
      },
      required: ['pod_id', 'confirm'],
    },
  },
  {
    name: 'list_runpod_gpu_types',
    description: 'List available RunPod GPU types with pricing, VRAM, and availability info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        min_vram_gb: {
          type: 'number',
          description: 'Minimum VRAM in GB to filter by (e.g. 24 for 24GB+ GPUs)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_runpod_account',
    description: 'Get RunPod account info including balance, current spend rate, and estimated time remaining.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
];

export const SERVER_TOOL_NAMES = new Set(serverToolDefinitions.map(t => t.name));

// Blocked path segments — never allow access to these
const BLOCKED_PATTERNS = ['.env', 'node_modules', '.git', '__pycache__', '.pyc'];

function isUnderRoots(filePath: string, roots: string[]): boolean {
  const resolved = path.resolve(filePath);

  // Check blocked patterns
  for (const blocked of BLOCKED_PATTERNS) {
    if (resolved.includes(blocked)) return false;
  }

  return roots.some(root => resolved.startsWith(root + path.sep) || resolved === root);
}

async function getReadRoots(): Promise<string[]> {
  const [datasetsRoot, trainingFolder] = await Promise.all([getDatasetsRoot(), getTrainingFolder()]);
  return [path.resolve(TOOLKIT_ROOT), path.resolve(datasetsRoot), path.resolve(trainingFolder)];
}

async function getWriteRoots(): Promise<string[]> {
  const [datasetsRoot, trainingFolder] = await Promise.all([getDatasetsRoot(), getTrainingFolder()]);
  // TOOLKIT_ROOT is excluded — it may be a read-only Nix store path
  return [path.resolve(datasetsRoot), path.resolve(trainingFolder)];
}

export async function isReadAllowed(filePath: string): Promise<boolean> {
  return isUnderRoots(filePath, await getReadRoots());
}

async function isWriteAllowed(filePath: string): Promise<boolean> {
  return isUnderRoots(filePath, await getWriteRoots());
}

/** Returns resolved paths for use in the system prompt */
export async function getResolvedPaths(): Promise<{
  toolkitRoot: string;
  datasetsRoot: string;
  trainingFolder: string;
}> {
  const [datasetsRoot, trainingFolder] = await Promise.all([getDatasetsRoot(), getTrainingFolder()]);
  return {
    toolkitRoot: path.resolve(TOOLKIT_ROOT),
    datasetsRoot: path.resolve(datasetsRoot),
    trainingFolder: path.resolve(trainingFolder),
  };
}

export async function executeServerTool(name: string, input: Record<string, unknown>): Promise<string> {
  if (name === 'read_file') {
    const filePath = input.path as string;
    const maxLines = (input.max_lines as number) || 200;

    if (!filePath) return 'Error: path is required';
    if (!(await isReadAllowed(filePath))) return `Error: access denied — path not in allowed directories`;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      if (lines.length > maxLines) {
        return (
          lines.slice(0, maxLines).join('\n') + `\n\n... (truncated, showing ${maxLines} of ${lines.length} lines)`
        );
      }
      return content;
    } catch (err) {
      return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'list_directory') {
    const dirPath = input.path as string;
    const pattern = input.pattern as string | undefined;

    if (!dirPath) return 'Error: path is required';
    if (!(await isReadAllowed(dirPath))) return `Error: access denied — path not in allowed directories`;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let results = entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
      }));

      // Filter by suffix pattern if provided
      if (pattern) {
        const suffix = pattern.startsWith('.') ? pattern : '.' + pattern;
        results = results.filter(r => r.type === 'directory' || r.name.endsWith(suffix));
      }

      // Cap output size
      if (results.length > 500) {
        results = results.slice(0, 500);
        return JSON.stringify(results, null, 2) + '\n\n... (truncated to 500 entries)';
      }

      return JSON.stringify(results, null, 2);
    } catch (err) {
      return `Error listing directory: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'write_file') {
    const filePath = input.path as string;
    const content = input.content as string;

    if (!filePath) return 'Error: path is required';
    if (content === undefined || content === null) return 'Error: content is required';
    if (!(await isWriteAllowed(filePath)))
      return `Error: access denied — can only write to datasets or training output directories`;

    try {
      // Create parent directories if they don't exist
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return `Successfully wrote ${content.length} bytes to ${filePath}`;
    } catch (err) {
      return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'analyze_dataset_quality') {
    const datasetName = input.dataset_name as string;
    const force = (input.force as boolean) || false;

    if (!datasetName) return 'Error: dataset_name is required';

    try {
      const result = await analyzeDataset(datasetName, { force });
      return JSON.stringify(result, null, 2);
    } catch (err) {
      return `Error analyzing dataset: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'get_dataset_issues') {
    const datasetName = input.dataset_name as string;
    const issueType = (input.issue_type as string) || 'all';

    if (!datasetName) return 'Error: dataset_name is required';

    try {
      const analysis = await getStoredAnalysis(datasetName);
      if (!analysis) {
        return 'No analysis found. Run analyze_dataset_quality first.';
      }

      if (issueType !== 'all') {
        const filtered: Record<string, unknown> = {
          dataset: datasetName,
          issue_type: issueType,
        };
        if (issueType === 'duplicates') {
          filtered.duplicateGroups = analysis.duplicateGroups;
          filtered.count = analysis.summary.duplicateGroupCount;
        } else if (issueType === 'blurry') {
          filtered.images = analysis.issues.blurry;
          filtered.count = analysis.summary.blurryCount;
        } else if (issueType === 'dark') {
          filtered.images = analysis.issues.dark;
          filtered.count = analysis.summary.darkCount;
        } else if (issueType === 'bright') {
          filtered.images = analysis.issues.bright;
          filtered.count = analysis.summary.brightCount;
        } else if (issueType === 'small') {
          filtered.images = analysis.issues.tooSmall;
          filtered.count = analysis.summary.tooSmallCount;
        } else if (issueType === 'low_contrast') {
          filtered.images = analysis.issues.lowContrast;
          filtered.count = analysis.summary.lowContrastCount;
        } else if (issueType === 'faces') {
          filtered.count = analysis.summary.facesCount;
          filtered.message = `${analysis.summary.facesCount} images with detected faces. Use the crop_faces tool to create a new dataset with face crops.`;
        } else {
          filtered.message = `Unknown issue type "${issueType}". Use: duplicates, blurry, dark, bright, small, low_contrast, faces, or all`;
        }
        return JSON.stringify(filtered, null, 2);
      }

      return JSON.stringify(analysis, null, 2);
    } catch (err) {
      return `Error getting dataset issues: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'view_dataset_image') {
    const imagePath = input.image_path as string;
    const question = (input.question as string) || 'Describe this image in detail.';

    if (!imagePath) return 'Error: image_path is required';
    if (!(await isReadAllowed(imagePath))) return `Error: access denied — path not in allowed directories`;

    type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    const ext = path.extname(imagePath).toLowerCase();
    const mediaTypeMap: Record<string, MediaType> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    const mediaType = mediaTypeMap[ext];
    if (!mediaType) return `Error: unsupported image type "${ext}"`;

    try {
      const imageData = await fs.readFile(imagePath);
      const auth = await getAnthropicAuth();
      if (!auth.apiKey && !auth.oauthToken) {
        return 'Error: Anthropic API key not configured';
      }
      const client = createAnthropicClient(auth);
      const model = await getClaudeCaptionModel();

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageData.toString('base64'),
                },
              },
              { type: 'text', text: question },
            ],
          },
        ],
      });
      void recordUsage('view_image', model, response);

      return response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');
    } catch (err) {
      return `Error viewing image: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'crop_faces') {
    const datasetName = input.dataset_name as string;
    const outputDatasetName = (input.output_dataset_name as string) || `${datasetName}_faces`;
    const trainingResolution = (input.training_resolution as number) || 512;
    const paddingVal = (input.padding as number) || 1.8;

    if (!datasetName) return 'Error: dataset_name is required';

    try {
      const datasetsRoot = await getDatasetsRoot();
      const datasetDir = path.join(datasetsRoot, datasetName);
      const outputDir = path.join(datasetsRoot, outputDatasetName);

      // Find all images in the dataset
      const CROP_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
      function findImages(dir: string): string[] {
        const results: string[] = [];
        if (!fsSync.existsSync(dir)) return results;
        for (const item of fsSync.readdirSync(dir)) {
          const p = path.join(dir, item);
          const s = fsSync.statSync(p);
          if (s.isDirectory() && item !== '_controls' && !item.startsWith('.')) {
            results.push(...findImages(p));
          } else if (CROP_IMAGE_EXTENSIONS.has(path.extname(p).toLowerCase())) {
            results.push(p);
          }
        }
        return results;
      }
      const imagePaths = findImages(datasetDir);
      if (imagePaths.length === 0) return 'Error: no images found in dataset';

      const summary = await runPythonAnalysis('face-crop', imagePaths, {
        outputDir,
        trainingResolution,
        padding: paddingVal,
      });

      return `Face cropping complete. Created ${summary.totalCrops || 0} face crops from ${summary.totalImages || 0} images.\nOutput dataset: ${outputDatasetName}\nOutput directory: ${outputDir}`;
    } catch (err) {
      return `Error cropping faces: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'delete_dataset_images') {
    const imagePaths = input.image_paths as string[];
    const reason = (input.reason as string) || 'No reason provided';

    if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
      return 'Error: image_paths array is required';
    }

    // Verify all paths are under allowed write roots (datasets/training output)
    for (const imgPath of imagePaths) {
      if (!(await isWriteAllowed(imgPath))) {
        return `Error: access denied — "${imgPath}" is not in a writable directory (datasets or training output)`;
      }
    }

    try {
      const result = await deleteAnalyzedImages(imagePaths);
      const summary = [`Deletion reason: ${reason}`, `Successfully deleted: ${result.deleted.length} image(s)`];
      if (result.errors.length > 0) {
        summary.push(`Errors: ${result.errors.join('; ')}`);
      }
      // List what was deleted
      for (const p of result.deleted) {
        summary.push(`  - ${p}`);
      }
      return summary.join('\n');
    } catch (err) {
      return `Error deleting images: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'list_jobs') {
    const statusFilter = input.status_filter as string | undefined;

    try {
      const where = statusFilter ? { status: statusFilter } : {};
      const jobs = await prisma.job.findMany({
        where,
        orderBy: [{ status: 'asc' }, { updated_at: 'desc' }],
        select: {
          id: true,
          name: true,
          status: true,
          step: true,
          speed_string: true,
          gpu_ids: true,
          queue_position: true,
          created_at: true,
          updated_at: true,
          info: true,
        },
      });
      return JSON.stringify(jobs, null, 2);
    } catch (err) {
      return `Error listing jobs: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'create_job') {
    const jobName = input.name as string;
    const jobConfig = input.job_config as string;
    const gpuIds = input.gpu_ids as string;

    if (!jobName) return 'Error: name is required';
    if (!jobConfig) return 'Error: job_config is required';
    if (!gpuIds) return 'Error: gpu_ids is required';

    try {
      // Get max queue_position for ordering
      const maxPos = await prisma.job.aggregate({ _max: { queue_position: true } });
      const nextPosition = (maxPos._max.queue_position ?? 0) + 1;

      const job = await prisma.job.create({
        data: {
          name: jobName,
          job_config: jobConfig,
          gpu_ids: gpuIds,
          status: 'stopped',
          queue_position: nextPosition,
        },
      });
      return JSON.stringify({ id: job.id, name: job.name, status: job.status, queue_position: job.queue_position });
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002') {
        return `Error: a job named "${jobName}" already exists`;
      }
      return `Error creating job: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'start_job') {
    const jobId = input.job_id as string;
    if (!jobId) return 'Error: job_id is required';

    try {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) return `Error: job "${jobId}" not found`;

      if (job.status === 'running') return `Job "${job.name}" is already running`;
      if (job.status === 'queued') return `Job "${job.name}" is already queued`;

      // Set job to queued
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'queued', stop: false },
      });

      // Ensure a queue row exists for this GPU set
      await prisma.queue.upsert({
        where: { gpu_ids: job.gpu_ids },
        create: { gpu_ids: job.gpu_ids, is_running: false },
        update: {},
      });

      return `Job "${job.name}" queued for execution on GPU ${job.gpu_ids}`;
    } catch (err) {
      return `Error starting job: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'list_datasets') {
    try {
      const datasetsRoot = await getDatasetsRoot();
      const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff']);
      const CAPTION_EXTENSIONS = new Set(['.txt']);

      if (!fsSync.existsSync(datasetsRoot)) {
        return JSON.stringify([]);
      }

      const entries = await fs.readdir(datasetsRoot, { withFileTypes: true });
      const datasets: { name: string; imageCount: number; captionCount: number }[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const datasetDir = path.join(datasetsRoot, entry.name);
        let imageCount = 0;
        let captionCount = 0;

        try {
          const files = await fs.readdir(datasetDir);
          for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (IMAGE_EXTENSIONS.has(ext)) imageCount++;
            if (CAPTION_EXTENSIONS.has(ext)) captionCount++;
          }
        } catch {
          // Skip unreadable directories
        }

        datasets.push({ name: entry.name, imageCount, captionCount });
      }

      return JSON.stringify(datasets, null, 2);
    } catch (err) {
      return `Error listing datasets: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'get_job_config') {
    const jobId = input.job_id as string | undefined;
    const jobName = input.job_name as string | undefined;

    if (!jobId && !jobName) return 'Error: either job_id or job_name is required';

    try {
      const job = jobId
        ? await prisma.job.findUnique({ where: { id: jobId } })
        : await prisma.job.findFirst({ where: { name: jobName } });

      if (!job) return `Error: job not found`;

      let config: unknown;
      try {
        config = JSON.parse(job.job_config);
      } catch {
        config = job.job_config;
      }

      return JSON.stringify(
        {
          id: job.id,
          name: job.name,
          status: job.status,
          config,
        },
        null,
        2,
      );
    } catch (err) {
      return `Error getting job config: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'stop_job') {
    const jobId = input.job_id as string;
    if (!jobId) return 'Error: job_id is required';

    try {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) return `Error: job "${jobId}" not found`;

      if (job.status === 'stopped') return `Job "${job.name}" is already stopped`;
      if (job.status === 'completed') return `Job "${job.name}" is already completed`;
      if (job.status === 'error') return `Job "${job.name}" is in error state`;

      await prisma.job.update({
        where: { id: jobId },
        data: { stop: true, return_to_queue: false },
      });

      return `Stop signal sent to job "${job.name}". It will stop after the current step completes.`;
    } catch (err) {
      return `Error stopping job: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'compare_jobs') {
    const jobIdA = input.job_id_a as string;
    const jobIdB = input.job_id_b as string;

    if (!jobIdA || !jobIdB) return 'Error: both job_id_a and job_id_b are required';

    try {
      const [jobA, jobB] = await Promise.all([
        prisma.job.findUnique({ where: { id: jobIdA } }),
        prisma.job.findUnique({ where: { id: jobIdB } }),
      ]);

      if (!jobA) return `Error: job "${jobIdA}" not found`;
      if (!jobB) return `Error: job "${jobIdB}" not found`;

      let configA: Record<string, unknown> = {};
      let configB: Record<string, unknown> = {};
      try {
        configA = JSON.parse(jobA.job_config) as Record<string, unknown>;
      } catch {
        /* raw string config */
      }
      try {
        configB = JSON.parse(jobB.job_config) as Record<string, unknown>;
      } catch {
        /* raw string config */
      }

      // Flatten configs for comparison
      function flatten(obj: unknown, prefix = ''): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              Object.assign(result, flatten(value, fullKey));
            } else {
              result[fullKey] = value;
            }
          }
        } else {
          result[prefix || '_root'] = obj;
        }
        return result;
      }

      const flatA = flatten(configA);
      const flatB = flatten(configB);
      const allKeys = new Set([...Object.keys(flatA), ...Object.keys(flatB)]);

      const changed: Record<string, { a: unknown; b: unknown }> = {};
      const onlyInA: Record<string, unknown> = {};
      const onlyInB: Record<string, unknown> = {};

      for (const key of allKeys) {
        const inA = key in flatA;
        const inB = key in flatB;
        if (inA && inB) {
          if (JSON.stringify(flatA[key]) !== JSON.stringify(flatB[key])) {
            changed[key] = { a: flatA[key], b: flatB[key] };
          }
        } else if (inA) {
          onlyInA[key] = flatA[key];
        } else {
          onlyInB[key] = flatB[key];
        }
      }

      return JSON.stringify(
        {
          job_a: { id: jobA.id, name: jobA.name, status: jobA.status, step: jobA.step, speed: jobA.speed_string },
          job_b: { id: jobB.id, name: jobB.name, status: jobB.status, step: jobB.step, speed: jobB.speed_string },
          config_diff: {
            changed,
            only_in_a: onlyInA,
            only_in_b: onlyInB,
          },
        },
        null,
        2,
      );
    } catch (err) {
      return `Error comparing jobs: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'analyze_samples') {
    const jobId = input.job_id as string;
    const count = (input.count as number) || 4;

    if (!jobId) return 'Error: job_id is required';

    try {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) return `Error: job "${jobId}" not found`;

      const trainingFolder = await getTrainingFolder();
      const samplesDir = path.join(trainingFolder, job.name, 'samples');

      if (!fsSync.existsSync(samplesDir)) {
        return `No samples directory found at ${samplesDir}. The job may not have generated samples yet.`;
      }

      const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
      const files = await fs.readdir(samplesDir);
      const imageFiles: { name: string; mtime: number }[] = [];

      for (const file of files) {
        if (!IMAGE_EXTS.has(path.extname(file).toLowerCase())) continue;
        const stat = await fs.stat(path.join(samplesDir, file));
        imageFiles.push({ name: file, mtime: stat.mtimeMs });
      }

      if (imageFiles.length === 0) {
        return 'No sample images found in the samples directory.';
      }

      // Sort by modification time descending, pick most recent N
      imageFiles.sort((a, b) => b.mtime - a.mtime);
      const selected = imageFiles.slice(0, count);

      const auth = await getAnthropicAuth();
      if (!auth.apiKey && !auth.oauthToken) {
        return 'Error: Anthropic API key not configured';
      }
      const client = createAnthropicClient(auth);
      const model = await getClaudeCaptionModel();

      type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
      const mediaTypeMap: Record<string, MediaType> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      };

      const results: { filename: string; description: string }[] = [];

      for (const file of selected) {
        const filePath = path.join(samplesDir, file.name);
        const ext = path.extname(file.name).toLowerCase();
        const mediaType = mediaTypeMap[ext] || 'image/png';

        const imageData = await fs.readFile(filePath);
        const response = await client.messages.create({
          model,
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: imageData.toString('base64'),
                  },
                },
                {
                  type: 'text',
                  text: 'This is a sample image from an AI training job. Describe what you see, noting image quality, artifacts, coherence, and any issues. Be concise.',
                },
              ],
            },
          ],
        });
        void recordUsage('analyze_sample', model, response);

        const description = response.content
          .filter(b => b.type === 'text')
          .map(b => (b as { type: 'text'; text: string }).text)
          .join('');

        results.push({ filename: file.name, description });
      }

      return JSON.stringify(
        {
          job_name: job.name,
          samples_dir: samplesDir,
          total_samples: imageFiles.length,
          analyzed: results,
        },
        null,
        2,
      );
    } catch (err) {
      return `Error analyzing samples: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'list_runpod_pods') {
    try {
      const pods = await prisma.runPodPod.findMany({
        where: { currentStatus: { not: 'terminated' } },
        orderBy: { createdAt: 'desc' },
      });

      if (pods.length === 0) {
        return 'No active RunPod pods found.';
      }

      const summary = pods.map(p => ({
        id: p.id,
        runpodId: p.runpodId,
        name: p.name,
        gpuType: p.gpuTypeDisplay || p.gpuTypeId,
        currentStatus: p.currentStatus,
        instanceType: p.instanceType,
        costPerHr: p.costPerHr,
        publicIp: p.publicIp || null,
        publicPort: p.publicPort || null,
        volumeGb: p.volumeInGb,
        createdAt: p.createdAt,
      }));

      return JSON.stringify(summary, null, 2);
    } catch (err) {
      return `Error listing pods: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'deploy_runpod_pod') {
    const podName = input.name as string;
    const gpuTypeId = input.gpu_type_id as string;
    const cloudType = (input.cloud_type as 'COMMUNITY' | 'SECURE') || 'COMMUNITY';
    const instanceType = (input.instance_type as string) || 'ON_DEMAND';
    const volumeGb = (input.volume_gb as number) || 50;

    if (!podName) return 'Error: name is required';
    if (!gpuTypeId) return 'Error: gpu_type_id is required';

    try {
      const authPassword = crypto.randomUUID().slice(0, 16);

      let deployed;
      let bidPerGpu = 0;

      if (instanceType === 'SPOT') {
        // Get spot pricing for bid
        const gpuTypes = await listGpuTypes();
        const gpuType = gpuTypes.find(g => g.id === gpuTypeId);
        const spotPrice = cloudType === 'SECURE' ? gpuType?.secureSpotPrice : gpuType?.communitySpotPrice;
        bidPerGpu = spotPrice || 0;

        if (bidPerGpu === 0) {
          return `Error: no spot pricing available for GPU type "${gpuTypeId}" in ${cloudType} cloud`;
        }

        const spotInput: DeploySpotPodInput = {
          name: podName,
          gpuTypeId,
          cloudType,
          volumeInGb: volumeGb,
          authPassword,
          bidPerGpu,
        };
        deployed = await deploySpotPod(spotInput);
      } else {
        const deployInput: DeployPodInput = {
          name: podName,
          gpuTypeId,
          cloudType,
          volumeInGb: volumeGb,
          authPassword,
        };
        deployed = await deployPod(deployInput);
      }

      // Create DB record
      const pod = await prisma.runPodPod.create({
        data: {
          runpodId: deployed.id,
          name: deployed.name,
          gpuTypeId,
          gpuTypeDisplay: gpuTypeId,
          cloudType,
          volumeInGb: volumeGb,
          costPerHr: deployed.costPerHr,
          desiredStatus: deployed.desiredStatus,
          currentStatus: 'deploying',
          authPassword,
          instanceType,
          bidPerGpu,
        },
      });

      return JSON.stringify(
        {
          id: pod.id,
          runpodId: deployed.id,
          name: deployed.name,
          gpuType: gpuTypeId,
          costPerHr: deployed.costPerHr,
          instanceType,
          volumeGb,
          authPassword,
          warning: `This pod costs $${deployed.costPerHr.toFixed(2)}/hr. Remember to stop or terminate it when done.`,
        },
        null,
        2,
      );
    } catch (err) {
      return `Error deploying pod: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'get_runpod_pod_status') {
    const podId = input.pod_id as string;
    if (!podId) return 'Error: pod_id is required';

    try {
      const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
      if (!pod) return `Error: pod "${podId}" not found in local database`;

      // Fetch live data from RunPod API
      let liveData = null;
      try {
        liveData = await getPod(pod.runpodId);
      } catch {
        // Live data unavailable — use DB data only
      }

      const result: Record<string, unknown> = {
        id: pod.id,
        runpodId: pod.runpodId,
        name: pod.name,
        gpuType: pod.gpuTypeDisplay || pod.gpuTypeId,
        currentStatus: liveData?.desiredStatus || pod.currentStatus,
        desiredStatus: pod.desiredStatus,
        instanceType: pod.instanceType,
        costPerHr: pod.costPerHr,
        publicIp: pod.publicIp || null,
        publicPort: pod.publicPort || null,
        volumeGb: pod.volumeInGb,
        createdAt: pod.createdAt,
        uptimeSeconds: pod.totalUptimeSeconds,
        estimatedSpend: pod.estimatedSpend,
      };

      if (liveData) {
        result.liveStatus = {
          desiredStatus: liveData.desiredStatus,
          costPerHr: liveData.costPerHr,
          machineId: liveData.machineId,
        };
        if (liveData.runtime) {
          result.liveStatus = {
            ...(result.liveStatus as Record<string, unknown>),
            uptimeInSeconds: liveData.runtime.uptimeInSeconds,
            ports: liveData.runtime.ports,
            gpus: liveData.runtime.gpus,
          };
        }
      }

      return JSON.stringify(result, null, 2);
    } catch (err) {
      return `Error getting pod status: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'stop_runpod_pod') {
    const podId = input.pod_id as string;
    if (!podId) return 'Error: pod_id is required';

    try {
      const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
      if (!pod) return `Error: pod "${podId}" not found`;

      if (pod.currentStatus === 'stopped') return `Pod "${pod.name}" is already stopped`;
      if (pod.currentStatus === 'terminated') return `Pod "${pod.name}" is terminated`;

      await stopPod(pod.runpodId);

      await prisma.runPodPod.update({
        where: { id: podId },
        data: { currentStatus: 'stopped', desiredStatus: 'EXITED' },
      });

      return `Pod "${pod.name}" is being stopped. Storage is preserved — use resume_runpod_pod to restart it.`;
    } catch (err) {
      return `Error stopping pod: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'resume_runpod_pod') {
    const podId = input.pod_id as string;
    if (!podId) return 'Error: pod_id is required';

    try {
      const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
      if (!pod) return `Error: pod "${podId}" not found`;

      if (pod.currentStatus === 'running') return `Pod "${pod.name}" is already running`;
      if (pod.currentStatus === 'terminated') return `Pod "${pod.name}" is terminated and cannot be resumed`;

      await resumePod(pod.runpodId);

      await prisma.runPodPod.update({
        where: { id: podId },
        data: { currentStatus: 'deploying', desiredStatus: 'RUNNING' },
      });

      return `Pod "${pod.name}" is resuming. It will be ready in a few minutes. Cost: $${pod.costPerHr.toFixed(2)}/hr.`;
    } catch (err) {
      return `Error resuming pod: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'terminate_runpod_pod') {
    const podId = input.pod_id as string;
    const confirm = input.confirm as boolean;

    if (!podId) return 'Error: pod_id is required';
    if (!confirm) {
      return 'Error: confirm must be true to terminate a pod. Termination is irreversible — all data on the pod will be deleted.';
    }

    try {
      const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
      if (!pod) return `Error: pod "${podId}" not found`;

      if (pod.currentStatus === 'terminated') return `Pod "${pod.name}" is already terminated`;

      // Check for active jobs on this pod's host
      if (pod.hostId) {
        const activeJobs = await prisma.job.findMany({
          where: { status: 'running', gpu_ids: { not: undefined } },
        });
        if (activeJobs.length > 0) {
          return `Warning: there may be active training jobs. Stop all jobs before terminating the pod. Active jobs: ${activeJobs.map(j => j.name).join(', ')}`;
        }
      }

      await terminatePod(pod.runpodId);

      await prisma.runPodPod.update({
        where: { id: podId },
        data: { currentStatus: 'terminated', terminatedAt: new Date() },
      });

      return `Pod "${pod.name}" has been terminated. All volume data has been deleted.`;
    } catch (err) {
      return `Error terminating pod: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'list_runpod_gpu_types') {
    const minVramGb = input.min_vram_gb as number | undefined;

    try {
      let gpuTypes = await listGpuTypes();

      if (minVramGb) {
        gpuTypes = gpuTypes.filter(g => g.memoryInGb >= minVramGb);
      }

      // Filter to GPUs that are actually available
      const available = gpuTypes
        .filter(g => g.communityCloud || g.secureCloud)
        .map(g => ({
          id: g.id,
          displayName: g.displayName,
          memoryGb: g.memoryInGb,
          communityPrice: g.communityPrice,
          securePrice: g.securePrice,
          communitySpotPrice: g.communitySpotPrice,
          secureSpotPrice: g.secureSpotPrice,
          availability: g.lowestPrice?.stockStatus || 'unknown',
          maxGpuCount: g.maxGpuCount,
        }));

      return JSON.stringify(available, null, 2);
    } catch (err) {
      return `Error listing GPU types: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (name === 'get_runpod_account') {
    try {
      const account = await getAccountInfo();

      const hoursRemaining =
        account.currentSpendPerHr > 0 ? Math.floor(account.clientBalance / account.currentSpendPerHr) : null;

      return JSON.stringify(
        {
          balance: `$${account.clientBalance.toFixed(2)}`,
          currentSpendPerHr: `$${account.currentSpendPerHr.toFixed(2)}/hr`,
          lifetimeSpend: `$${account.clientLifetimeSpend.toFixed(2)}`,
          spendLimit: `$${account.spendLimit.toFixed(2)}`,
          underBalance: account.underBalance,
          estimatedHoursRemaining: hoursRemaining,
        },
        null,
        2,
      );
    } catch (err) {
      return `Error getting account info: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return `Error: unknown server tool "${name}"`;
}

/**
 * Execute view_dataset_image with pre-fetched remote image bytes.
 * The vision API call runs locally (hub has the API key), but the image
 * comes from a remote host rather than the local filesystem.
 */
export async function executeViewImageRemote(
  input: Record<string, unknown>,
  imageBuffer: Buffer,
  mediaType: string,
): Promise<string> {
  const question = (input.question as string) || 'Describe this image in detail.';

  type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  if (!allowedTypes.has(mediaType)) {
    return `Error: unsupported image type "${mediaType}"`;
  }

  try {
    const auth = await getAnthropicAuth();
    if (!auth.apiKey && !auth.oauthToken) {
      return 'Error: Anthropic API key not configured';
    }
    const client = createAnthropicClient(auth);
    const model = await getClaudeCaptionModel();

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as VisionMediaType,
                data: imageBuffer.toString('base64'),
              },
            },
            { type: 'text', text: question },
          ],
        },
      ],
    });
    void recordUsage('view_image', model, response);

    return response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');
  } catch (err) {
    return `Error viewing remote image: ${err instanceof Error ? err.message : String(err)}`;
  }
}
