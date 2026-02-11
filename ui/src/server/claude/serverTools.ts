import fs from 'fs/promises';
import path from 'path';
import { TOOLKIT_ROOT } from '@/paths';
import { getDatasetsRoot, getTrainingFolder } from '@/server/settings';

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

async function isReadAllowed(filePath: string): Promise<boolean> {
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

  return `Error: unknown server tool "${name}"`;
}
