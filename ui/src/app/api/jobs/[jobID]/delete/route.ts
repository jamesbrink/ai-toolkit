import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { getTrainingFolder } from '@/server/settings';
import path from 'path';
import fs from 'fs';
import { killJobProcess } from '@/server/killJobProcess';

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobID: string }> }) {
  const { jobID } = await params;

  const job = await prisma.job.findUnique({
    where: { id: jobID },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const trainingRoot = await getTrainingFolder();
  const trainingFolder = path.join(trainingRoot, job.name);

  // Kill the running process BEFORE deleting the folder (which contains pid.txt)
  killJobProcess(trainingFolder);

  if (fs.existsSync(trainingFolder)) {
    fs.rmSync(trainingFolder, { recursive: true });
  }

  await prisma.job.delete({
    where: { id: jobID },
  });

  return NextResponse.json(job);
}
