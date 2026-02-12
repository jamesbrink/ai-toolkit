import { NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { defaultTrainFolder, defaultDatasetsFolder } from '@/paths';
import { flushCache } from '@/server/settings';

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
    return NextResponse.json(settingsObject);
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
      CLAUDE_CHAT_MODEL,
      CLAUDE_CAPTION_MODEL,
      MDNS_ENABLED,
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
      upsert('CLAUDE_CHAT_MODEL', CLAUDE_CHAT_MODEL),
      upsert('CLAUDE_CAPTION_MODEL', CLAUDE_CAPTION_MODEL),
      upsert('MDNS_ENABLED', MDNS_ENABLED),
    ]);

    flushCache();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
