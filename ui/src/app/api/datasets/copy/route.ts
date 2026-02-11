import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getDatasetsRoot } from '@/server/settings';

export async function POST(req: NextRequest) {
  try {
    const { sourceName, newName } = await req.json();

    if (!sourceName || !newName || typeof sourceName !== 'string' || typeof newName !== 'string') {
      return NextResponse.json({ error: 'sourceName and newName are required' }, { status: 400 });
    }

    const trimmed = newName.trim();
    if (!trimmed || /[/\\:*?"<>|]/.test(trimmed)) {
      return NextResponse.json({ error: 'Invalid dataset name' }, { status: 400 });
    }

    const datasetsRoot = await getDatasetsRoot();
    const srcPath = path.join(datasetsRoot, sourceName);
    const destPath = path.join(datasetsRoot, trimmed);

    // Path traversal protection
    if (!srcPath.startsWith(datasetsRoot) || !destPath.startsWith(datasetsRoot)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Verify source exists
    try {
      await fs.access(srcPath);
    } catch {
      return NextResponse.json({ error: 'Source dataset not found' }, { status: 404 });
    }

    // Verify destination doesn't exist
    try {
      await fs.access(destPath);
      return NextResponse.json({ error: 'A dataset with that name already exists' }, { status: 409 });
    } catch {
      // Good — target doesn't exist
    }

    // Recursively copy the entire dataset directory
    await fs.cp(srcPath, destPath, { recursive: true });

    return NextResponse.json({ ok: true, name: trimmed });
  } catch (err) {
    console.error('Copy error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Copy failed' },
      { status: 500 },
    );
  }
}
