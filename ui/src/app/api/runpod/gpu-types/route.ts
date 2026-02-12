import { NextResponse } from 'next/server';
import { listGpuTypes } from '@/server/runpod';

export async function GET() {
  try {
    const gpuTypes = await listGpuTypes();
    return NextResponse.json({ gpuTypes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch GPU types';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
