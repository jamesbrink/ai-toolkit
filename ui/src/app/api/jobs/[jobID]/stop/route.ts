import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { getTrainingFolder } from '@/server/settings';
import path from 'path';
import { killJobProcess } from '@/server/killJobProcess';

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobID: string }> }) {
  const { jobID } = await params;

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobID },
    });

    // Set stop flag in DB (Python process may pick this up gracefully)
    await prisma.job.update({
      where: { id: jobID },
      data: {
        stop: true,
        info: 'Stopping job...',
      },
    });

    // Also kill the OS process directly via pid.txt
    if (job) {
      const trainingRoot = await getTrainingFolder();
      const trainingFolder = path.join(trainingRoot, job.name);
      killJobProcess(trainingFolder);
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error('Error stopping job:', error);
    return NextResponse.json({ error: 'Failed to stop job' }, { status: 500 });
  }
}
