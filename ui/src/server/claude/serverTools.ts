import fs from 'fs/promises';
import path from 'path';
import { TOOLKIT_ROOT, defaultDatasetsFolder, defaultTrainFolder } from '@/paths';

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
];

export const SERVER_TOOL_NAMES = new Set(serverToolDefinitions.map(t => t.name));

// Blocked path segments — never allow reading these
const BLOCKED_PATTERNS = ['.env', 'node_modules', '.git', '__pycache__', '.pyc'];

function getAllowedRoots(): string[] {
  return [
    path.resolve(TOOLKIT_ROOT),
    path.resolve(defaultDatasetsFolder),
    path.resolve(defaultTrainFolder),
  ];
}

function isPathAllowed(filePath: string): boolean {
  const resolved = path.resolve(filePath);

  // Check blocked patterns
  for (const blocked of BLOCKED_PATTERNS) {
    if (resolved.includes(blocked)) return false;
  }

  // Must be under an allowed root
  const roots = getAllowedRoots();
  return roots.some(root => resolved.startsWith(root + path.sep) || resolved === root);
}

export async function executeServerTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === 'read_file') {
    const filePath = input.path as string;
    const maxLines = (input.max_lines as number) || 200;

    if (!filePath) return 'Error: path is required';
    if (!isPathAllowed(filePath)) return `Error: access denied — path not in allowed directories`;

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
    if (!isPathAllowed(dirPath)) return `Error: access denied — path not in allowed directories`;

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

  return `Error: unknown server tool "${name}"`;
}
