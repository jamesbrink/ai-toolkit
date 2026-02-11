import sharp from 'sharp';
import fs from 'fs/promises';

export interface ImageMetrics {
  filePath: string;
  width: number;
  height: number;
  fileSize: number;
  format: string;
  pHash: string;
  avgBrightness: number;
  brightnessStdDev: number;
  laplacianVariance: number;
  isBlurry: boolean;
  isDark: boolean;
  isBright: boolean;
  isTooSmall: boolean;
  qualityScore: number;
  fileModifiedAt: Date;
}

export interface DuplicateGroupResult {
  imagePaths: string[];
  maxSimilarity: number;
}

// Precompute the 32x32 DCT-II matrix coefficients
const DCT_SIZE = 32;
const dctMatrix: number[][] = [];
for (let u = 0; u < DCT_SIZE; u++) {
  dctMatrix[u] = [];
  const cu = u === 0 ? Math.sqrt(1 / DCT_SIZE) : Math.sqrt(2 / DCT_SIZE);
  for (let x = 0; x < DCT_SIZE; x++) {
    dctMatrix[u][x] = cu * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * DCT_SIZE));
  }
}

/**
 * Compute a perceptual hash (pHash) for an image.
 * Resizes to 32x32 grayscale, applies DCT, takes top-left 8x8 low-frequency
 * coefficients, thresholds at median to produce a 64-bit hash as 16-char hex.
 */
export async function computePerceptualHash(filePath: string): Promise<string> {
  const { data } = await sharp(filePath)
    .resize(DCT_SIZE, DCT_SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Build 2D pixel array
  const pixels: number[][] = [];
  for (let y = 0; y < DCT_SIZE; y++) {
    pixels[y] = [];
    for (let x = 0; x < DCT_SIZE; x++) {
      pixels[y][x] = data[y * DCT_SIZE + x];
    }
  }

  // Apply 2D DCT: first transform rows, then transform columns
  // Row transform
  const rowTransformed: number[][] = [];
  for (let y = 0; y < DCT_SIZE; y++) {
    rowTransformed[y] = [];
    for (let u = 0; u < DCT_SIZE; u++) {
      let sum = 0;
      for (let x = 0; x < DCT_SIZE; x++) {
        sum += pixels[y][x] * dctMatrix[u][x];
      }
      rowTransformed[y][u] = sum;
    }
  }

  // Column transform
  const dctResult: number[][] = [];
  for (let v = 0; v < DCT_SIZE; v++) {
    dctResult[v] = [];
    for (let u = 0; u < DCT_SIZE; u++) {
      let sum = 0;
      for (let y = 0; y < DCT_SIZE; y++) {
        sum += rowTransformed[y][u] * dctMatrix[v][y];
      }
      dctResult[v][u] = sum;
    }
  }

  // Extract top-left 8x8 low-frequency coefficients (excluding DC at [0][0])
  const HASH_SIZE = 8;
  const lowFreq: number[] = [];
  for (let v = 0; v < HASH_SIZE; v++) {
    for (let u = 0; u < HASH_SIZE; u++) {
      if (v === 0 && u === 0) continue; // skip DC component
      lowFreq.push(dctResult[v][u]);
    }
  }

  // Compute median
  const sorted = [...lowFreq].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  // Build 64-bit binary string (DC component is always 1 as the first bit)
  let bits = '1';
  for (const val of lowFreq) {
    bits += val >= median ? '1' : '0';
  }

  // Convert 64-bit binary string to 16-char hex
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.substring(i, i + 4), 2).toString(16);
  }

  return hex;
}

/**
 * Compute the Laplacian variance of an image as a blur detection metric.
 * Resizes to 256x256 grayscale, applies a 3x3 Laplacian kernel,
 * and returns the variance of the output. Low variance = blurry.
 */
export async function computeLaplacianVariance(
  filePath: string
): Promise<number> {
  const SIZE = 256;
  const { data } = await sharp(filePath)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Laplacian kernel: [[0,1,0],[1,-4,1],[0,1,0]]
  const laplacianValues: number[] = [];

  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const idx = y * SIZE + x;
      const lap =
        data[idx - SIZE] + // top
        data[idx - 1] + // left
        -4 * data[idx] + // center
        data[idx + 1] + // right
        data[idx + SIZE]; // bottom
      laplacianValues.push(lap);
    }
  }

  // Compute variance
  const n = laplacianValues.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += laplacianValues[i];
  }
  const mean = sum / n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    const diff = laplacianValues[i] - mean;
    variance += diff * diff;
  }
  variance /= n;

  return variance;
}

/**
 * Compute brightness statistics for an image.
 * Uses sharp stats to get channel means and computes luminance.
 */
export async function computeBrightness(
  filePath: string
): Promise<{ avg: number; stdDev: number }> {
  const stats = await sharp(filePath).stats();
  const channels = stats.channels;

  // For grayscale images, use the single channel
  if (channels.length === 1) {
    return {
      avg: channels[0].mean,
      stdDev: channels[0].stdev,
    };
  }

  // For color images, compute luminance: 0.299*R + 0.587*G + 0.114*B
  const rMean = channels[0].mean;
  const gMean = channels[1].mean;
  const bMean = channels[2].mean;
  const luminance = 0.299 * rMean + 0.587 * gMean + 0.114 * bMean;

  // Weighted standard deviation
  const rStd = channels[0].stdev;
  const gStd = channels[1].stdev;
  const bStd = channels[2].stdev;
  const stdDev = Math.sqrt(
    0.299 * rStd * rStd + 0.587 * gStd * gStd + 0.114 * bStd * bStd
  );

  return { avg: luminance, stdDev };
}

/**
 * Compute the Hamming distance between two perceptual hash hex strings.
 * Returns 0-64 (0 = identical, 64 = completely different).
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error(
      `Hash length mismatch: ${hash1.length} vs ${hash2.length}`
    );
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const n1 = parseInt(hash1[i], 16);
    const n2 = parseInt(hash2[i], 16);
    // XOR and popcount for each hex digit (4 bits)
    let xor = n1 ^ n2;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

/**
 * Analyze a single image and return comprehensive metrics.
 */
export async function analyzeImage(filePath: string): Promise<ImageMetrics> {
  const [metadata, stat, pHash, laplacianVariance, brightness] =
    await Promise.all([
      sharp(filePath).metadata(),
      fs.stat(filePath),
      computePerceptualHash(filePath),
      computeLaplacianVariance(filePath),
      computeBrightness(filePath),
    ]);

  if (!metadata.width || !metadata.height) {
    throw new Error(`Failed to read image dimensions for: ${filePath}`);
  }

  const width = metadata.width;
  const height = metadata.height;
  const format = metadata.format || 'unknown';
  const fileSize = stat.size;
  const fileModifiedAt = stat.mtime;

  const isBlurry = laplacianVariance < 100;
  const isDark = brightness.avg < 30;
  const isBright = brightness.avg > 235;
  const isTooSmall = Math.min(width, height) < 256;

  // Compute quality score
  let qualityScore = 100;
  if (isBlurry) qualityScore -= 30;
  if (isDark) qualityScore -= 20;
  if (isBright) qualityScore -= 20;
  if (isTooSmall) qualityScore -= 25;

  return {
    filePath,
    width,
    height,
    fileSize,
    format,
    pHash,
    avgBrightness: brightness.avg,
    brightnessStdDev: brightness.stdDev,
    laplacianVariance,
    isBlurry,
    isDark,
    isBright,
    isTooSmall,
    qualityScore,
    fileModifiedAt,
  };
}

/**
 * Find groups of duplicate/near-duplicate images using perceptual hashing.
 * Uses union-find to build connected components from pairwise comparisons.
 *
 * @param analyses - Array of ImageMetrics (must include pHash)
 * @param threshold - Maximum hamming distance to consider as duplicates (default: 10)
 * @returns Array of duplicate groups with member paths and similarity scores
 */
export function findDuplicateGroups(
  analyses: ImageMetrics[],
  threshold: number = 10
): DuplicateGroupResult[] {
  const n = analyses.length;
  if (n < 2) return [];

  // Union-Find
  const parent = new Int32Array(n);
  const rank = new Int32Array(n);
  // Track max hamming distance within each component for similarity calculation
  const maxHammingInGroup = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    parent[i] = i;
  }

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path compression
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number, dist: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      maxHammingInGroup[ra] = Math.max(maxHammingInGroup[ra], dist);
      return;
    }
    // Union by rank
    if (rank[ra] < rank[rb]) {
      parent[ra] = rb;
      maxHammingInGroup[rb] = Math.max(
        maxHammingInGroup[rb],
        maxHammingInGroup[ra],
        dist
      );
    } else if (rank[ra] > rank[rb]) {
      parent[rb] = ra;
      maxHammingInGroup[ra] = Math.max(
        maxHammingInGroup[ra],
        maxHammingInGroup[rb],
        dist
      );
    } else {
      parent[rb] = ra;
      rank[ra]++;
      maxHammingInGroup[ra] = Math.max(
        maxHammingInGroup[ra],
        maxHammingInGroup[rb],
        dist
      );
    }
  }

  // O(n^2) pairwise comparison
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = hammingDistance(analyses[i].pHash, analyses[j].pHash);
      if (dist <= threshold) {
        union(i, j, dist);
      }
    }
  }

  // Collect groups
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(i);
  }

  // Build results (only groups with 2+ members are duplicates)
  const results: DuplicateGroupResult[] = [];
  for (const [root, members] of groups) {
    if (members.length < 2) continue;

    const imagePaths = members.map((idx) => analyses[idx].filePath);
    const maxDist = maxHammingInGroup[root];
    const maxSimilarity = ((64 - maxDist) / 64) * 100;

    results.push({
      imagePaths,
      maxSimilarity,
    });
  }

  // Sort by group size descending
  results.sort((a, b) => b.imagePaths.length - a.imagePaths.length);

  return results;
}
