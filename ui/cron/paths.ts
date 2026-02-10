import path from 'path';
import prisma from './prisma';

export const TOOLKIT_ROOT = process.env.TOOLKIT_ROOT || path.resolve('@', '..', '..');
export const defaultTrainFolder = process.env.TRAINING_FOLDER || path.join(TOOLKIT_ROOT, 'output');
export const defaultDatasetsFolder = process.env.DATASETS_FOLDER || path.join(TOOLKIT_ROOT, 'datasets');
export const defaultDataRoot = process.env.DATA_ROOT || path.join(TOOLKIT_ROOT, 'data');

console.log('TOOLKIT_ROOT:', TOOLKIT_ROOT);

export const getTrainingFolder = async () => {
  const key = 'TRAINING_FOLDER';
  let row = await prisma.settings.findFirst({
    where: {
      key: key,
    },
  });
  let trainingRoot = defaultTrainFolder;
  if (row?.value && row.value !== '') {
    trainingRoot = row.value;
  }
  return trainingRoot as string;
};

export const getHFToken = async () => {
  const key = 'HF_TOKEN';
  let row = await prisma.settings.findFirst({
    where: {
      key: key,
    },
  });
  let token = '';
  if (row?.value && row.value !== '') {
    token = row.value;
  }
  return token;
};
