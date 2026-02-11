import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getDatasetsRoot } from '@/server/settings';

export async function POST(req: NextRequest) {
  try {
    const { oldName, newName } = await req.json();

    if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string') {
      return NextResponse.json({ error: 'oldName and newName are required' }, { status: 400 });
    }

    const trimmed = newName.trim();
    if (!trimmed || /[/\\:*?"<>|]/.test(trimmed)) {
      return NextResponse.json({ error: 'Invalid dataset name' }, { status: 400 });
    }

    const datasetsRoot = await getDatasetsRoot();
    const oldPath = path.join(datasetsRoot, oldName);
    const newPath = path.join(datasetsRoot, trimmed);

    // Ensure both resolve under datasetsRoot
    if (!oldPath.startsWith(datasetsRoot) || !newPath.startsWith(datasetsRoot)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    try {
      await fs.access(oldPath);
    } catch {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    try {
      await fs.access(newPath);
      return NextResponse.json({ error: 'A dataset with that name already exists' }, { status: 409 });
    } catch {
      // Good — target doesn't exist
    }

    await fs.rename(oldPath, newPath);

    return NextResponse.json({ ok: true, name: trimmed });
  } catch (err) {
    console.error('Rename error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Rename failed' },
      { status: 500 },
    );
  }
}
