import path from 'path';
export const TOOLKIT_ROOT = process.env.TOOLKIT_ROOT || path.resolve('@', '..', '..');
export const defaultTrainFolder = process.env.TRAINING_FOLDER || path.join(TOOLKIT_ROOT, 'output');
export const defaultDatasetsFolder = process.env.DATASETS_FOLDER || path.join(TOOLKIT_ROOT, 'datasets');
export const defaultDataRoot = process.env.DATA_ROOT || path.join(TOOLKIT_ROOT, 'data');
