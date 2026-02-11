import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { getDatasetsRoot } from '@/server/settings';
import { analyzeImage, findDuplicateGroups, ImageMetrics } from '@/server/imageAnalysis';

const prisma = new PrismaClient();

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export interface DatasetAnalysisResult {
  datasetName: string;
  totalImages: number;
  analyzedImages: number;
  duplicateGroups: {
    id: number;
    imagePaths: string[];
    maxSimilarity: number;
    dismissed: boolean;
  }[];
  issues: {
    blurry: string[];
    dark: string[];
    bright: string[];
    tooSmall: string[];
  };
  summary: {
    duplicateGroupCount: number;
    blurryCount: number;
    darkCount: number;
    brightCount: number;
    tooSmallCount: number;
    avgQualityScore: number;
  };
}

export interface AnalysisProgress {
  type: 'progress';
  current: number;
  total: number;
  imagePath: string;
}

function findImagesRecursively(dir: string): string[] {
  const results: string[] = [];
  if (!fsSync.existsSync(dir)) return results;

  const items = fsSync.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fsSync.statSync(itemPath);
    if (stat.isDirectory() && item !== '_controls' && !item.startsWith('.')) {
      results.push(...findImagesRecursively(itemPath));
    } else {
      const ext = path.extname(itemPath).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        results.push(itemPath);
      }
    }
  }
  return results;
}

export async function analyzeDataset(
  datasetName: string,
  options?: {
    force?: boolean;
    onProgress?: (progress: AnalysisProgress) => void;
  },
): Promise<DatasetAnalysisResult> {
  const datasetsRoot = await getDatasetsRoot();
  const datasetDir = path.join(datasetsRoot, datasetName);
  const imagePaths = findImagesRecursively(datasetDir);
  const total = imagePaths.length;
  const allMetrics: ImageMetrics[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];

    // Check if we can skip (incremental analysis)
    if (!options?.force) {
      try {
        const stat = await fs.stat(imagePath);
        const existing = await prisma.imageAnalysis.findUnique({
          where: { filePath: imagePath },
        });
        if (existing && existing.fileModifiedAt.getTime() === stat.mtime.getTime()) {
          // File unchanged, use stored metrics
          allMetrics.push({
            filePath: existing.filePath,
            width: existing.width,
            height: existing.height,
            fileSize: existing.fileSize,
            format: existing.format,
            pHash: existing.pHash,
            avgBrightness: existing.avgBrightness,
            brightnessStdDev: existing.brightnessStdDev,
            laplacianVariance: existing.laplacianVariance,
            isBlurry: existing.isBlurry,
            isDark: existing.isDark,
            isBright: existing.isBright,
            isTooSmall: existing.isTooSmall,
            qualityScore: existing.qualityScore,
            fileModifiedAt: existing.fileModifiedAt,
          });
          options?.onProgress?.({ type: 'progress', current: i + 1, total, imagePath });
          continue;
        }
      } catch {
        // File doesn't exist in DB or stat failed, analyze it
      }
    }

    try {
      const metrics = await analyzeImage(imagePath);
      allMetrics.push(metrics);

      // Upsert into Prisma
      await prisma.imageAnalysis.upsert({
        where: { filePath: imagePath },
        create: {
          filePath: metrics.filePath,
          datasetName,
          width: metrics.width,
          height: metrics.height,
          fileSize: metrics.fileSize,
          format: metrics.format,
          pHash: metrics.pHash,
          avgBrightness: metrics.avgBrightness,
          brightnessStdDev: metrics.brightnessStdDev,
          laplacianVariance: metrics.laplacianVariance,
          isBlurry: metrics.isBlurry,
          isDark: metrics.isDark,
          isBright: metrics.isBright,
          isTooSmall: metrics.isTooSmall,
          qualityScore: metrics.qualityScore,
          fileModifiedAt: metrics.fileModifiedAt,
        },
        update: {
          width: metrics.width,
          height: metrics.height,
          fileSize: metrics.fileSize,
          format: metrics.format,
          pHash: metrics.pHash,
          avgBrightness: metrics.avgBrightness,
          brightnessStdDev: metrics.brightnessStdDev,
          laplacianVariance: metrics.laplacianVariance,
          isBlurry: metrics.isBlurry,
          isDark: metrics.isDark,
          isBright: metrics.isBright,
          isTooSmall: metrics.isTooSmall,
          qualityScore: metrics.qualityScore,
          fileModifiedAt: metrics.fileModifiedAt,
          analyzedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`Failed to analyze ${imagePath}:`, err);
    }

    options?.onProgress?.({ type: 'progress', current: i + 1, total, imagePath });
  }

  // Clean up stale entries for images that no longer exist
  const currentPaths = new Set(imagePaths);
  const staleEntries = await prisma.imageAnalysis.findMany({
    where: { datasetName },
    select: { filePath: true },
  });
  const staleToDelete = staleEntries
    .filter(e => !currentPaths.has(e.filePath))
    .map(e => e.filePath);
  if (staleToDelete.length > 0) {
    await prisma.imageAnalysis.deleteMany({
      where: { filePath: { in: staleToDelete } },
    });
  }

  // Find duplicate groups
  const dupGroups = findDuplicateGroups(allMetrics);

  // Clear old duplicate groups for this dataset, then insert new ones
  await prisma.duplicateGroup.deleteMany({ where: { datasetName } });

  const createdGroups: { id: number; imagePaths: string[]; maxSimilarity: number; dismissed: boolean }[] = [];
  for (const group of dupGroups) {
    const groupHash = group.imagePaths.sort().join('|');
    const created = await prisma.duplicateGroup.create({
      data: {
        datasetName,
        groupHash,
        imagePaths: JSON.stringify(group.imagePaths),
        maxSimilarity: group.maxSimilarity,
      },
    });
    createdGroups.push({
      id: created.id,
      imagePaths: group.imagePaths,
      maxSimilarity: group.maxSimilarity,
      dismissed: false,
    });
  }

  return buildResult(datasetName, allMetrics, createdGroups);
}

export async function getStoredAnalysis(datasetName: string): Promise<DatasetAnalysisResult | null> {
  const analyses = await prisma.imageAnalysis.findMany({
    where: { datasetName },
  });

  if (analyses.length === 0) return null;

  const groups = await prisma.duplicateGroup.findMany({
    where: { datasetName },
  });

  const metrics: ImageMetrics[] = analyses.map(a => ({
    filePath: a.filePath,
    width: a.width,
    height: a.height,
    fileSize: a.fileSize,
    format: a.format,
    pHash: a.pHash,
    avgBrightness: a.avgBrightness,
    brightnessStdDev: a.brightnessStdDev,
    laplacianVariance: a.laplacianVariance,
    isBlurry: a.isBlurry,
    isDark: a.isDark,
    isBright: a.isBright,
    isTooSmall: a.isTooSmall,
    qualityScore: a.qualityScore,
    fileModifiedAt: a.fileModifiedAt,
  }));

  const parsedGroups = groups.map(g => ({
    id: g.id,
    imagePaths: JSON.parse(g.imagePaths) as string[],
    maxSimilarity: g.maxSimilarity,
    dismissed: g.dismissed,
  }));

  return buildResult(datasetName, metrics, parsedGroups);
}

export async function dismissDuplicateGroup(groupId: number): Promise<void> {
  await prisma.duplicateGroup.update({
    where: { id: groupId },
    data: { dismissed: true },
  });
}

export async function deleteAnalyzedImages(imagePaths: string[]): Promise<{ deleted: string[]; errors: string[] }> {
  const deleted: string[] = [];
  const errors: string[] = [];

  for (const imgPath of imagePaths) {
    try {
      // Delete the image file
      await fs.unlink(imgPath);

      // Delete associated caption file if it exists
      const ext = path.extname(imgPath);
      const captionPath = imgPath.replace(ext, '.txt');
      try {
        await fs.unlink(captionPath);
      } catch {
        // No caption file, that's fine
      }

      // Remove from ImageAnalysis
      await prisma.imageAnalysis.deleteMany({
        where: { filePath: imgPath },
      });

      deleted.push(imgPath);
    } catch (err) {
      errors.push(`${imgPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Update DuplicateGroups: remove deleted paths from groups
  const allGroups = await prisma.duplicateGroup.findMany();
  const deletedSet = new Set(deleted);

  for (const group of allGroups) {
    const paths = JSON.parse(group.imagePaths) as string[];
    const remaining = paths.filter(p => !deletedSet.has(p));
    if (remaining.length <= 1) {
      // Group no longer meaningful, delete it
      await prisma.duplicateGroup.delete({ where: { id: group.id } });
    } else if (remaining.length < paths.length) {
      await prisma.duplicateGroup.update({
        where: { id: group.id },
        data: { imagePaths: JSON.stringify(remaining) },
      });
    }
  }

  return { deleted, errors };
}

function buildResult(
  datasetName: string,
  metrics: ImageMetrics[],
  groups: { id: number; imagePaths: string[]; maxSimilarity: number; dismissed: boolean }[],
): DatasetAnalysisResult {
  const blurry = metrics.filter(m => m.isBlurry).map(m => m.filePath);
  const dark = metrics.filter(m => m.isDark).map(m => m.filePath);
  const bright = metrics.filter(m => m.isBright).map(m => m.filePath);
  const tooSmall = metrics.filter(m => m.isTooSmall).map(m => m.filePath);
  const avgScore = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.qualityScore, 0) / metrics.length
    : 100;

  return {
    datasetName,
    totalImages: metrics.length,
    analyzedImages: metrics.length,
    duplicateGroups: groups,
    issues: { blurry, dark, bright, tooSmall },
    summary: {
      duplicateGroupCount: groups.filter(g => !g.dismissed).length,
      blurryCount: blurry.length,
      darkCount: dark.length,
      brightCount: bright.length,
      tooSmallCount: tooSmall.length,
      avgQualityScore: Math.round(avgScore),
    },
  };
}
