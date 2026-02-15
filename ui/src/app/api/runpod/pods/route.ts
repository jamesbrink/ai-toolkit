import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/server/prisma';
import { deployPod, deploySpotPod } from '@/server/runpod';
import { getHFToken } from '@/server/settings';

export async function GET() {
  try {
    const pods = await prisma.runPodPod.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ pods });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch pods';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      gpuTypeId,
      gpuTypeDisplay,
      gpuCount,
      cloudType,
      volumeInGb,
      containerDiskInGb,
      dataCenterId,
      dataCenterName,
      dataCenterRegion,
      instanceType,
      bidPerGpu,
      publicKey,
      env,
    } = body;

    if (!name || !gpuTypeId) {
      return NextResponse.json({ error: 'name and gpuTypeId are required' }, { status: 400 });
    }

    // Use static default password if configured, otherwise generate a random one
    const defaultPw = await prisma.settings.findFirst({ where: { key: 'RUNPOD_DEFAULT_PASSWORD' } });
    const authPassword = defaultPw?.value || crypto.randomBytes(18).toString('base64url');

    // Inject HuggingFace token so the pod can download gated models
    const hfToken = (await getHFToken()) || process.env.HF_TOKEN || '';
    const mergedEnv: Record<string, string> = { ...(env || {}) };
    if (hfToken && !mergedEnv.HF_TOKEN) {
      mergedEnv.HF_TOKEN = hfToken;
    }

    const baseInput = {
      name,
      gpuTypeId,
      gpuCount: gpuCount || 1,
      cloudType: cloudType || 'COMMUNITY',
      volumeInGb: volumeInGb || 50,
      containerDiskInGb: containerDiskInGb || 20,
      dataCenterId: dataCenterId || undefined,
      authPassword,
      publicKey,
      env: Object.keys(mergedEnv).length > 0 ? mergedEnv : undefined,
    };

    const isSpot = instanceType === 'SPOT';
    const deployed = isSpot
      ? await deploySpotPod({ ...baseInput, bidPerGpu: bidPerGpu || 0 })
      : await deployPod(baseInput);

    // Create local tracking record
    const pod = await prisma.runPodPod.create({
      data: {
        runpodId: deployed.id,
        name: deployed.name,
        gpuTypeId,
        gpuTypeDisplay: gpuTypeDisplay || '',
        gpuCount: gpuCount || 1,
        cloudType: cloudType || 'COMMUNITY',
        volumeInGb: volumeInGb || 50,
        containerDiskInGb: containerDiskInGb || 20,
        costPerHr: deployed.costPerHr || 0,
        desiredStatus: 'RUNNING',
        currentStatus: 'deploying',
        dataCenterId: dataCenterId || '',
        dataCenterName: dataCenterName || '',
        dataCenterRegion: dataCenterRegion || '',
        instanceType: isSpot ? 'SPOT' : 'ON_DEMAND',
        bidPerGpu: isSpot ? bidPerGpu || 0 : 0,
        authPassword,
        startedAt: new Date(),
      },
    });

    return NextResponse.json({ pod }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deploy pod';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
