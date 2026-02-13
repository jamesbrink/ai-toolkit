import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import prisma from '@/server/prisma';
import { defaultTrainFolder, defaultDatasetsFolder } from '@/paths';
import { flushCache } from '@/server/settings';

const SSH_KEY_CANDIDATES = ['id_ed25519.pub', 'id_rsa.pub', 'id_ecdsa.pub'];

async function getDefaultSshPublicKey(): Promise<string> {
  const sshDir = join(homedir(), '.ssh');
  for (const filename of SSH_KEY_CANDIDATES) {
    try {
      const content = await readFile(join(sshDir, filename), 'utf-8');
      const trimmed = content.trim();
      if (trimmed) return trimmed;
    } catch {
      // File doesn't exist or isn't readable, try next
    }
  }
  return '';
}

export async function GET() {
  try {
    const settings = await prisma.settings.findMany();
    const settingsObject = settings.reduce((acc: Record<string, string>, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
    // if TRAINING_FOLDER is not set, use default
    if (!settingsObject.TRAINING_FOLDER || settingsObject.TRAINING_FOLDER === '') {
      settingsObject.TRAINING_FOLDER = defaultTrainFolder;
    }
    // if DATASETS_FOLDER is not set, use default
    if (!settingsObject.DATASETS_FOLDER || settingsObject.DATASETS_FOLDER === '') {
      settingsObject.DATASETS_FOLDER = defaultDatasetsFolder;
    }
    // If SSH key is not set, fall back to user's local key (not persisted)
    if (!settingsObject.RUNPOD_SSH_PUBLIC_KEY) {
      settingsObject.RUNPOD_SSH_PUBLIC_KEY = await getDefaultSshPublicKey();
    }
    // Tell the client which secrets are set via env var (without leaking the actual value)
    const envFlags: Record<string, boolean> = {};
    if (!settingsObject.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY) {
      envFlags.ANTHROPIC_API_KEY = true;
    }
    if (!settingsObject.CLAUDE_CODE_OAUTH_TOKEN && process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      envFlags.CLAUDE_CODE_OAUTH_TOKEN = true;
    }

    return NextResponse.json({ ...settingsObject, _envSet: envFlags });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      HF_TOKEN,
      TRAINING_FOLDER,
      DATASETS_FOLDER,
      ANTHROPIC_API_KEY,
      CLAUDE_CODE_OAUTH_TOKEN,
      CLAUDE_CHAT_MODEL,
      CLAUDE_CAPTION_MODEL,
      MDNS_ENABLED,
      RUNPOD_API_KEY,
      RUNPOD_SSH_PUBLIC_KEY,
      RUNPOD_DEFAULT_PASSWORD,
    } = body;

    // Upsert all settings
    const upsert = (key: string, value: string) =>
      prisma.settings.upsert({
        where: { key },
        update: { value: value || '' },
        create: { key, value: value || '' },
      });

    await Promise.all([
      upsert('HF_TOKEN', HF_TOKEN),
      upsert('TRAINING_FOLDER', TRAINING_FOLDER),
      upsert('DATASETS_FOLDER', DATASETS_FOLDER),
      upsert('ANTHROPIC_API_KEY', ANTHROPIC_API_KEY),
      upsert('CLAUDE_CODE_OAUTH_TOKEN', CLAUDE_CODE_OAUTH_TOKEN),
      upsert('CLAUDE_CHAT_MODEL', CLAUDE_CHAT_MODEL),
      upsert('CLAUDE_CAPTION_MODEL', CLAUDE_CAPTION_MODEL),
      upsert('MDNS_ENABLED', MDNS_ENABLED),
      upsert('RUNPOD_API_KEY', RUNPOD_API_KEY),
      upsert('RUNPOD_SSH_PUBLIC_KEY', RUNPOD_SSH_PUBLIC_KEY),
      upsert('RUNPOD_DEFAULT_PASSWORD', RUNPOD_DEFAULT_PASSWORD),
    ]);

    flushCache();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
