import { getRunPodApiKey } from '@/server/settings';
import NodeCache from 'node-cache';

const RUNPOD_API_URL = 'https://api.runpod.io/graphql';
const gpuCache = new NodeCache({ stdTTL: 300 }); // 5 min cache for GPU types
const accountCache = new NodeCache({ stdTTL: 60 }); // 1 min cache for account info

/** Default Docker image for deployed pods */
export const RUNPOD_IMAGE = 'ghcr.io/jamesbrink/ai-toolkit:latest';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function runpodFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = await getRunPodApiKey();
  if (!apiKey) {
    throw new Error('RunPod API key not configured. Add it in Settings → Cloud Providers.');
  }

  const response = await fetch(RUNPOD_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`RunPod API error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;
  if (!json.data) {
    const msg = json.errors?.length ? json.errors.map(e => e.message).join(', ') : 'RunPod API returned no data';
    throw new Error(`RunPod GraphQL error: ${msg}`);
  }
  // Surface errors when data exists but contains null mutation results (e.g. no available GPUs)
  if (json.errors?.length) {
    const allNull = Object.values(json.data as Record<string, unknown>).every(v => v === null);
    if (allNull) {
      throw new Error(`RunPod error: ${json.errors.map(e => e.message).join(', ')}`);
    }
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Account Info
// ---------------------------------------------------------------------------

export interface AccountInfo {
  clientBalance: number;
  currentSpendPerHr: number;
  underBalance: boolean;
  minBalance: number;
  spendLimit: number;
  clientLifetimeSpend: number;
}

export async function getAccountInfo(): Promise<AccountInfo> {
  const cached = accountCache.get<AccountInfo>('accountInfo');
  if (cached) return cached;

  const query = `query {
    myself {
      clientBalance
      currentSpendPerHr
      underBalance
      minBalance
      spendLimit
      clientLifetimeSpend
    }
  }`;

  const data = await runpodFetch<{ myself: AccountInfo }>(query);
  accountCache.set('accountInfo', data.myself);
  return data.myself;
}

// ---------------------------------------------------------------------------
// GPU Types
// ---------------------------------------------------------------------------

export interface GpuTypeLowestPrice {
  stockStatus: string | null;
  rentedCount: number;
  totalCount: number;
}

export interface GpuTypeDatacenter {
  id: string;
  name: string;
  location: string;
}

export interface GpuType {
  id: string;
  displayName: string;
  memoryInGb: number;
  secureCloud: boolean;
  communityCloud: boolean;
  communityPrice: number | null;
  securePrice: number | null;
  lowestPrice: GpuTypeLowestPrice | null;
  communitySpotPrice: number | null;
  secureSpotPrice: number | null;
  maxGpuCount: number;
  maxGpuCountCommunityCloud: number;
  maxGpuCountSecureCloud: number;
  nodeGroupDatacenters: GpuTypeDatacenter[];
}

export async function listGpuTypes(): Promise<GpuType[]> {
  const cached = gpuCache.get<GpuType[]>('gpuTypes');
  if (cached) return cached;

  const query = `query {
    gpuTypes {
      id
      displayName
      memoryInGb
      secureCloud
      communityCloud
      communityPrice
      securePrice
      lowestPrice {
        stockStatus
        rentedCount
        totalCount
      }
      communitySpotPrice
      secureSpotPrice
      maxGpuCount
      maxGpuCountCommunityCloud
      maxGpuCountSecureCloud
      nodeGroupDatacenters {
        id
        name
        location
      }
    }
  }`;

  const data = await runpodFetch<{ gpuTypes: GpuType[] }>(query);
  gpuCache.set('gpuTypes', data.gpuTypes);
  return data.gpuTypes;
}

// ---------------------------------------------------------------------------
// Deploy Pod
// ---------------------------------------------------------------------------

export interface DeployPodInput {
  name: string;
  gpuTypeId: string;
  gpuCount?: number;
  cloudType?: 'COMMUNITY' | 'SECURE';
  volumeInGb?: number;
  containerDiskInGb?: number;
  dataCenterId?: string;
  authPassword: string;
  publicKey?: string;
  env?: Record<string, string>;
}

export interface DeployedPod {
  id: string;
  name: string;
  desiredStatus: string;
  imageName: string;
  costPerHr: number;
}

export async function deployPod(input: DeployPodInput): Promise<DeployedPod> {
  const envVars: Array<{ key: string; value: string }> = [{ key: 'AI_TOOLKIT_AUTH', value: input.authPassword }];
  if (input.publicKey) {
    envVars.push({ key: 'PUBLIC_KEY', value: input.publicKey });
  }
  if (input.env) {
    for (const [key, value] of Object.entries(input.env)) {
      envVars.push({ key, value });
    }
  }

  const mutationInput: Record<string, unknown> = {
    name: input.name,
    imageName: RUNPOD_IMAGE,
    gpuTypeId: input.gpuTypeId,
    gpuCount: input.gpuCount || 1,
    cloudType: input.cloudType || 'COMMUNITY',
    volumeInGb: input.volumeInGb || 50,
    containerDiskInGb: input.containerDiskInGb || 20,
    ports: '8675/http,22/tcp',
    volumeMountPath: '/workspace',
    env: envVars,
  };
  if (input.dataCenterId) {
    mutationInput.dataCenterId = input.dataCenterId;
  }

  const data = await runpodFetch<{ podFindAndDeployOnDemand: DeployedPod }>(
    `
    mutation ($input: PodFindAndDeployOnDemandInput!) {
      podFindAndDeployOnDemand(input: $input) {
        id
        name
        desiredStatus
        imageName
        costPerHr
      }
    }
  `,
    { input: mutationInput },
  );

  if (!data.podFindAndDeployOnDemand) {
    throw new Error('No GPU available for the selected type and cloud. Try a different GPU or cloud type.');
  }
  return data.podFindAndDeployOnDemand;
}

// ---------------------------------------------------------------------------
// Deploy Spot Pod
// ---------------------------------------------------------------------------

export interface DeploySpotPodInput extends DeployPodInput {
  bidPerGpu: number;
}

export async function deploySpotPod(input: DeploySpotPodInput): Promise<DeployedPod> {
  const envVars: Array<{ key: string; value: string }> = [{ key: 'AI_TOOLKIT_AUTH', value: input.authPassword }];
  if (input.publicKey) {
    envVars.push({ key: 'PUBLIC_KEY', value: input.publicKey });
  }
  if (input.env) {
    for (const [key, value] of Object.entries(input.env)) {
      envVars.push({ key, value });
    }
  }

  const mutationInput: Record<string, unknown> = {
    name: input.name,
    imageName: RUNPOD_IMAGE,
    gpuTypeId: input.gpuTypeId,
    gpuCount: input.gpuCount || 1,
    cloudType: input.cloudType || 'COMMUNITY',
    volumeInGb: input.volumeInGb || 50,
    containerDiskInGb: input.containerDiskInGb || 20,
    bidPerGpu: input.bidPerGpu,
    ports: '8675/http,22/tcp',
    volumeMountPath: '/workspace',
    env: envVars,
  };
  if (input.dataCenterId) {
    mutationInput.dataCenterId = input.dataCenterId;
  }

  const data = await runpodFetch<{ podRentInterruptable: DeployedPod }>(
    `
    mutation ($input: PodRentInterruptableInput!) {
      podRentInterruptable(input: $input) {
        id
        name
        desiredStatus
        imageName
        costPerHr
      }
    }
  `,
    { input: mutationInput },
  );

  if (!data.podRentInterruptable) {
    throw new Error('No spot GPU available. Try a different GPU type, higher bid, or switch to on-demand.');
  }
  return data.podRentInterruptable;
}

// ---------------------------------------------------------------------------
// Pod Status
// ---------------------------------------------------------------------------

export interface PodRuntime {
  uptimeInSeconds: number;
  ports: Array<{
    ip: string;
    isIpPublic: boolean;
    privatePort: number;
    publicPort: number;
  }> | null;
  gpus: Array<{
    id: string;
    gpuUtilPerc: number;
    memoryUtilPerc: number;
  }> | null;
}

export interface PodStatus {
  id: string;
  name: string;
  desiredStatus: string;
  lastStatusChange: string;
  imageName: string;
  costPerHr: number;
  machineId: string | null;
  machine: { dataCenterId: string } | null;
  runtime: PodRuntime | null;
}

const POD_STATUS_FIELDS = `
  id
  name
  desiredStatus
  lastStatusChange
  imageName
  costPerHr
  machineId
  machine {
    dataCenterId
  }
  runtime {
    uptimeInSeconds
    ports {
      ip
      isIpPublic
      privatePort
      publicPort
    }
    gpus {
      id
      gpuUtilPerc
      memoryUtilPerc
    }
  }
`;

export async function getPod(podId: string): Promise<PodStatus> {
  const data = await runpodFetch<{ pod: PodStatus }>(
    `
    query ($input: PodFilter!) {
      pod(input: $input) {
        ${POD_STATUS_FIELDS}
      }
    }
  `,
    { input: { podId } },
  );

  return data.pod;
}

// ---------------------------------------------------------------------------
// List My Pods
// ---------------------------------------------------------------------------

export async function listMyPods(): Promise<PodStatus[]> {
  const query = `query {
    myself {
      pods {
        ${POD_STATUS_FIELDS}
      }
    }
  }`;

  const data = await runpodFetch<{ myself: { pods: PodStatus[] } }>(query);
  return data.myself.pods;
}

// ---------------------------------------------------------------------------
// Pod Lifecycle
// ---------------------------------------------------------------------------

export async function stopPod(podId: string): Promise<void> {
  await runpodFetch(
    `
    mutation ($input: PodStopInput!) {
      podStop(input: $input) {
        id
        desiredStatus
      }
    }
  `,
    { input: { podId } },
  );
}

export async function resumePod(podId: string, gpuCount = 1): Promise<void> {
  await runpodFetch(
    `
    mutation ($input: PodResumeInput!) {
      podResume(input: $input) {
        id
        desiredStatus
        costPerHr
      }
    }
  `,
    { input: { podId, gpuCount } },
  );
}

export async function terminatePod(podId: string): Promise<void> {
  await runpodFetch(
    `
    mutation ($input: PodTerminateInput!) {
      podTerminate(input: $input)
    }
  `,
    { input: { podId } },
  );
}
