import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { findLatestCheckpointStep } from '@/server/checkpointUtils';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobID: string }> }) {
  const { jobID } = await params;

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobID },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const step = await findLatestCheckpointStep(job.name);
    return NextResponse.json({ step });
  } catch (error) {
    console.error('Error checking checkpoint step:', error);
    return NextResponse.json({ error: 'Failed to check checkpoint step' }, { status: 500 });
  }
}
