import prisma from '@/server/prisma';
import { defaultDatasetsFolder, defaultDataRoot } from '@/paths';
import { defaultTrainFolder } from '@/paths';
import NodeCache from 'node-cache';

const myCache = new NodeCache();

export const flushCache = () => {
  myCache.flushAll();
};

export const getDatasetsRoot = async () => {
  const key = 'DATASETS_FOLDER';
  let datasetsPath = myCache.get(key) as string;
  if (datasetsPath) {
    return datasetsPath;
  }
  const row = await prisma.settings.findFirst({
    where: {
      key: 'DATASETS_FOLDER',
    },
  });
  datasetsPath = defaultDatasetsFolder;
  if (row?.value && row.value !== '') {
    datasetsPath = row.value;
  }
  myCache.set(key, datasetsPath);
  return datasetsPath as string;
};

export const getTrainingFolder = async () => {
  const key = 'TRAINING_FOLDER';
  let trainingRoot = myCache.get(key) as string;
  if (trainingRoot) {
    return trainingRoot;
  }
  const row = await prisma.settings.findFirst({
    where: {
      key: key,
    },
  });
  trainingRoot = defaultTrainFolder;
  if (row?.value && row.value !== '') {
    trainingRoot = row.value;
  }
  myCache.set(key, trainingRoot);
  return trainingRoot as string;
};

export const getHFToken = async () => {
  const key = 'HF_TOKEN';
  let token = myCache.get(key) as string;
  if (token) {
    return token;
  }
  const row = await prisma.settings.findFirst({
    where: {
      key: key,
    },
  });
  token = '';
  if (row?.value && row.value !== '') {
    token = row.value;
  }
  myCache.set(key, token);
  return token;
};

export interface AnthropicAuth {
  apiKey?: string;
  oauthToken?: string;
}

export const getAnthropicAuth = async (): Promise<AnthropicAuth> => {
  // 1. Check for API key in DB settings
  const key = 'ANTHROPIC_API_KEY';
  let apiKey = myCache.get(key) as string;
  if (!apiKey) {
    const row = await prisma.settings.findFirst({
      where: { key },
    });
    apiKey = row?.value && row.value !== '' ? row.value : '';
    myCache.set(key, apiKey);
  }
  if (apiKey) {
    return { apiKey };
  }

  // 2. Fallback to ANTHROPIC_API_KEY env var
  if (process.env.ANTHROPIC_API_KEY) {
    return { apiKey: process.env.ANTHROPIC_API_KEY };
  }

  // 3. Fallback to CLAUDE_CODE_OAUTH_TOKEN env var
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN };
  }

  return {};
};

export const getAnthropicApiKey = async (): Promise<string> => {
  const auth = await getAnthropicAuth();
  return auth.apiKey || auth.oauthToken || '';
};

export const getRunPodApiKey = async (): Promise<string> => {
  const key = 'RUNPOD_API_KEY';
  let apiKey = myCache.get(key) as string;
  if (apiKey) {
    return apiKey;
  }
  const row = await prisma.settings.findFirst({
    where: { key },
  });
  apiKey = row?.value && row.value !== '' ? row.value : process.env.RUNPOD_API_KEY || '';
  myCache.set(key, apiKey);
  return apiKey;
};

export const getRunPodSshKey = async (): Promise<string> => {
  const key = 'RUNPOD_SSH_PUBLIC_KEY';
  let sshKey = myCache.get(key) as string;
  if (sshKey !== undefined) return sshKey;
  const row = await prisma.settings.findFirst({ where: { key } });
  sshKey = row?.value && row.value !== '' ? row.value : '';
  myCache.set(key, sshKey);
  return sshKey;
};

const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_CAPTION_MODEL = 'claude-haiku-4-5-20251001';

export const getClaudeChatModel = async (): Promise<string> => {
  const key = 'CLAUDE_CHAT_MODEL';
  let model = myCache.get(key) as string;
  if (model) return model;
  const row = await prisma.settings.findFirst({ where: { key } });
  model = row?.value && row.value !== '' ? row.value : process.env.CLAUDE_MODEL || DEFAULT_CHAT_MODEL;
  myCache.set(key, model);
  return model;
};

export const getClaudeCaptionModel = async (): Promise<string> => {
  const key = 'CLAUDE_CAPTION_MODEL';
  let model = myCache.get(key) as string;
  if (model) return model;
  const row = await prisma.settings.findFirst({ where: { key } });
  model = row?.value && row.value !== '' ? row.value : process.env.CLAUDE_MODEL || DEFAULT_CAPTION_MODEL;
  myCache.set(key, model);
  return model;
};

export const getDataRoot = async () => {
  const key = 'DATA_ROOT';
  let dataRoot = myCache.get(key) as string;
  if (dataRoot) {
    return dataRoot;
  }
  const row = await prisma.settings.findFirst({
    where: {
      key: key,
    },
  });
  dataRoot = defaultDataRoot;
  if (row?.value && row.value !== '') {
    dataRoot = row.value;
  }
  myCache.set(key, dataRoot);
  return dataRoot;
};
