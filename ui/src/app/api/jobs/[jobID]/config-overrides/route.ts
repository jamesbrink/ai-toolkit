import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';

const ALLOWED_KEYS = new Set([
  'sample_every',
  'save_every',
  'log_every',
  'lr',
  'cfg_scale',
  'gradient_accumulation',
]);

export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobID: string }> }) {
  const { jobID } = await params;

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobID },
      select: { config_overrides: true },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const overrides = job.config_overrides ? JSON.parse(job.config_overrides) : {};
    return NextResponse.json({ overrides });
  } catch (error) {
    console.error('Error getting config overrides:', error);
    return NextResponse.json({ error: 'Failed to get config overrides' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ jobID: string }> }) {
  const { jobID } = await params;

  try {
    const body = await request.json();
    const incoming: Record<string, unknown> = body.overrides ?? {};

    // Validate keys and values
    const validated: Record<string, number> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (!ALLOWED_KEYS.has(key)) {
        return NextResponse.json({ error: `Key "${key}" is not a tweakable parameter` }, { status: 400 });
      }
      if (typeof value !== 'number' || !isFinite(value)) {
        return NextResponse.json({ error: `Value for "${key}" must be a finite number` }, { status: 400 });
      }
      validated[key] = value;
    }

    // Merge with existing overrides
    const job = await prisma.job.findUnique({
      where: { id: jobID },
      select: { config_overrides: true, status: true },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const existing = job.config_overrides ? JSON.parse(job.config_overrides) : {};
    const merged = { ...existing, ...validated };

    await prisma.job.update({
      where: { id: jobID },
      data: { config_overrides: JSON.stringify(merged) },
    });

    return NextResponse.json({ overrides: merged });
  } catch (error) {
    console.error('Error setting config overrides:', error);
    return NextResponse.json({ error: 'Failed to set config overrides' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ jobID: string }> }) {
  const { jobID } = await params;

  try {
    await prisma.job.update({
      where: { id: jobID },
      data: { config_overrides: '' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing config overrides:', error);
    return NextResponse.json({ error: 'Failed to clear config overrides' }, { status: 500 });
  }
}
