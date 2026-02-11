import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const prisma = new PrismaClient();
const execAsync = promisify(exec);

async function detectDeviceType(): Promise<string> {
  // Check for NVIDIA GPU
  try {
    await execAsync(os.platform() === 'win32' ? 'nvidia-smi -L' : 'which nvidia-smi');
    return 'nvidia';
  } catch {
    // No NVIDIA GPU
  }

  // Check for Apple Silicon MPS
  if (os.platform() === 'darwin' && os.arch() === 'arm64') {
    return 'mps';
  }

  return 'cpu';
}

export async function GET() {
  try {
    // Get or create instance ID
    let setting = await prisma.settings.findUnique({ where: { key: 'INSTANCE_ID' } });
    if (!setting) {
      const newId = randomUUID();
      setting = await prisma.settings.create({
        data: { key: 'INSTANCE_ID', value: newId },
      });
    }

    const deviceType = await detectDeviceType();
    const port = parseInt(process.env.PORT || '8675', 10);

    return NextResponse.json({
      instanceId: setting.value,
      hostname: os.hostname(),
      version: '1.0.0',
      deviceType,
      port,
    });
  } catch (error) {
    console.error('Error in /api/hosts/identify:', error);
    return NextResponse.json({ error: 'Failed to get instance identity' }, { status: 500 });
  }
}
