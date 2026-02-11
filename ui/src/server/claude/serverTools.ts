import fs from 'fs/promises';
import path from 'path';
import { TOOLKIT_ROOT } from '@/paths';
import { getDatasetsRoot, getTrainingFolder, getAnthropicAuth } from '@/server/settings';
import { createAnthropicClient, getClaudeCaptionModel } from '@/server/claude/client';
import { analyzeDataset, getStoredAnalysis } from '@/server/datasetAnalysis';

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
      'Analyze a dataset for image quality issues and near-duplicate images. Scans all images and returns a summary of duplicates, blurry, dark, bright, and too-small images with quality scores.',
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
    description:
      'Get stored quality analysis results for a dataset, optionally filtered by issue type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dataset_name: { type: 'string', description: 'Name of the dataset' },
        issue_type: {
          type: 'string',
          description:
            'Filter by issue type: all, duplicates, blurry, dark, bright, small (default: all)',
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
  const [datasetsRoot, trainingFolder] = await Promise.all([
    getDatasetsRoot(),
    getTrainingFolder(),
  ]);
  return [
    path.resolve(TOOLKIT_ROOT),
    path.resolve(datasetsRoot),
    path.resolve(trainingFolder),
  ];
}

async function getWriteRoots(): Promise<string[]> {
  const [datasetsRoot, trainingFolder] = await Promise.all([
    getDatasetsRoot(),
    getTrainingFolder(),
  ]);
  // TOOLKIT_ROOT is excluded — it may be a read-only Nix store path
  return [
    path.resolve(datasetsRoot),
    path.resolve(trainingFolder),
  ];
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
  const [datasetsRoot, trainingFolder] = await Promise.all([
    getDatasetsRoot(),
    getTrainingFolder(),
  ]);
  return {
    toolkitRoot: path.resolve(TOOLKIT_ROOT),
    datasetsRoot: path.resolve(datasetsRoot),
    trainingFolder: path.resolve(trainingFolder),
  };
}

export async function executeServerTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === 'read_file') {
    const filePath = input.path as string;
    const maxLines = (input.max_lines as number) || 200;

    if (!filePath) return 'Error: path is required';
    if (!(await isReadAllowed(filePath)))
      return `Error: access denied — path not in allowed directories`;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      if (lines.length > maxLines) {
        return lines.slice(0, maxLines).join('\n') + `\n\n... (truncated, showing ${maxLines} of ${lines.length} lines)`;
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
    if (!(await isReadAllowed(dirPath)))
      return `Error: access denied — path not in allowed directories`;

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
        } else {
          filtered.message = `Unknown issue type "${issueType}". Use: duplicates, blurry, dark, bright, small, or all`;
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
    if (!(await isReadAllowed(imagePath)))
      return `Error: access denied — path not in allowed directories`;

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

      return response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');
    } catch (err) {
      return `Error viewing image: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return `Error: unknown server tool "${name}"`;
}
