import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import prisma from '@/server/prisma';
import { getDatasetsRoot } from '@/server/settings';
import { computePerceptualHash, findDuplicateGroups, ImageMetrics } from '@/server/imageAnalysis';
import { runPythonAnalysis, PythonAnalysisResult } from '@/server/pythonAnalysis';

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
    lowContrast: string[];
  };
  summary: {
    duplicateGroupCount: number;
    blurryCount: number;
    darkCount: number;
    brightCount: number;
    tooSmallCount: number;
    lowContrastCount: number;
    facesCount: number;
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

  // Determine which images need analysis vs can use cached results
  const pathsToAnalyze: string[] = [];
  const cachedByPath = new Map<string, ImageMetrics>();

  for (const imagePath of imagePaths) {
    if (!options?.force) {
      try {
        const stat = await fs.stat(imagePath);
        const existing = await prisma.imageAnalysis.findUnique({
          where: { filePath: imagePath },
        });
        if (existing && existing.fileModifiedAt.getTime() === stat.mtime.getTime()) {
          cachedByPath.set(imagePath, {
            filePath: existing.filePath,
            width: existing.width,
            height: existing.height,
            fileSize: existing.fileSize,
            format: existing.format,
            pHash: existing.pHash,
            avgBrightness: existing.avgBrightness,
            brightnessStdDev: existing.brightnessStdDev,
            laplacianVariance: existing.laplacianVariance,
            contrast: existing.contrast,
            isBlurry: existing.isBlurry,
            isDark: existing.isDark,
            isBright: existing.isBright,
            isLowContrast: existing.isLowContrast,
            isTooSmall: existing.isTooSmall,
            hasFaces: existing.hasFaces,
            faceCount: existing.faceCount,
            facesJson: existing.facesJson,
            qualityScore: existing.qualityScore,
            fileModifiedAt: existing.fileModifiedAt,
          });
          continue;
        }
      } catch {
        // Not in DB or stat failed — needs analysis
      }
    }
    pathsToAnalyze.push(imagePath);
  }

  // Collect Python analysis results indexed by path
  const pythonResultsByPath = new Map<string, PythonAnalysisResult>();

  if (pathsToAnalyze.length > 0) {
    // Run Python OpenCV analysis for quality metrics + face detection
    const progressOffset = cachedByPath.size;
    await runPythonAnalysis(
      'analyze',
      pathsToAnalyze,
      {},
      {
        onResult: result => {
          pythonResultsByPath.set(result.filePath as string, result);
        },
        onProgress: (current, _total) => {
          options?.onProgress?.({
            type: 'progress',
            current: progressOffset + current,
            total,
            imagePath: pathsToAnalyze[current - 1] || '',
          });
        },
        onError: (error, filePath) => {
          console.error(`Python analysis error for ${filePath}: ${error}`);
        },
      },
    );
  }

  // Build final metrics: merge pHash (Node.js) with quality data (Python)
  let processedCount = 0;
  for (const imagePath of imagePaths) {
    const cached = cachedByPath.get(imagePath);
    if (cached) {
      allMetrics.push(cached);
      processedCount++;
      options?.onProgress?.({ type: 'progress', current: processedCount, total, imagePath });
      continue;
    }

    const pyResult = pythonResultsByPath.get(imagePath);
    if (!pyResult) {
      processedCount++;
      continue;
    }

    try {
      // Compute pHash in Node.js (works correctly with sharp's DCT)
      const pHash = await computePerceptualHash(imagePath);
      const stat = await fs.stat(imagePath);
      const metadata = await (await import('sharp')).default(imagePath).metadata();

      const metrics: ImageMetrics = {
        filePath: imagePath,
        width: pyResult.width as number,
        height: pyResult.height as number,
        fileSize: pyResult.fileSize as number,
        format: metadata.format || 'unknown',
        pHash,
        avgBrightness: pyResult.avgBrightness as number,
        brightnessStdDev: 0, // Not computed by Python; kept for schema compat
        laplacianVariance: pyResult.laplacianVariance as number,
        contrast: pyResult.contrast as number,
        isBlurry: pyResult.isBlurry as boolean,
        isDark: pyResult.isDark as boolean,
        isBright: pyResult.isBright as boolean,
        isLowContrast: pyResult.isLowContrast as boolean,
        isTooSmall: pyResult.isTooSmall as boolean,
        hasFaces: pyResult.hasFaces as boolean,
        faceCount: pyResult.faceCount as number,
        facesJson: JSON.stringify(pyResult.faces || []),
        qualityScore: pyResult.qualityScore as number,
        fileModifiedAt: stat.mtime,
      };

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
          contrast: metrics.contrast,
          isBlurry: metrics.isBlurry,
          isDark: metrics.isDark,
          isBright: metrics.isBright,
          isLowContrast: metrics.isLowContrast,
          isTooSmall: metrics.isTooSmall,
          hasFaces: metrics.hasFaces,
          faceCount: metrics.faceCount,
          facesJson: metrics.facesJson,
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
          contrast: metrics.contrast,
          isBlurry: metrics.isBlurry,
          isDark: metrics.isDark,
          isBright: metrics.isBright,
          isLowContrast: metrics.isLowContrast,
          isTooSmall: metrics.isTooSmall,
          hasFaces: metrics.hasFaces,
          faceCount: metrics.faceCount,
          facesJson: metrics.facesJson,
          qualityScore: metrics.qualityScore,
          fileModifiedAt: metrics.fileModifiedAt,
          analyzedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`Failed to process ${imagePath}:`, err);
    }

    processedCount++;
  }

  // Clean up stale entries for images that no longer exist
  const currentPaths = new Set(imagePaths);
  const staleEntries = await prisma.imageAnalysis.findMany({
    where: { datasetName },
    select: { filePath: true },
  });
  const staleToDelete = staleEntries.filter(e => !currentPaths.has(e.filePath)).map(e => e.filePath);
  if (staleToDelete.length > 0) {
    await prisma.imageAnalysis.deleteMany({
      where: { filePath: { in: staleToDelete } },
    });
  }

  // Find duplicate groups (pHash-based, still in Node.js)
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
    contrast: a.contrast,
    isBlurry: a.isBlurry,
    isDark: a.isDark,
    isBright: a.isBright,
    isLowContrast: a.isLowContrast,
    isTooSmall: a.isTooSmall,
    hasFaces: a.hasFaces,
    faceCount: a.faceCount,
    facesJson: a.facesJson,
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
  const lowContrast = metrics.filter(m => m.isLowContrast).map(m => m.filePath);
  const withFaces = metrics.filter(m => m.hasFaces);
  const avgScore = metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.qualityScore, 0) / metrics.length : 100;

  return {
    datasetName,
    totalImages: metrics.length,
    analyzedImages: metrics.length,
    duplicateGroups: groups,
    issues: { blurry, dark, bright, tooSmall, lowContrast },
    summary: {
      duplicateGroupCount: groups.filter(g => !g.dismissed).length,
      blurryCount: blurry.length,
      darkCount: dark.length,
      brightCount: bright.length,
      tooSmallCount: tooSmall.length,
      lowContrastCount: lowContrast.length,
      facesCount: withFaces.length,
      avgQualityScore: Math.round(avgScore),
    },
  };
}
