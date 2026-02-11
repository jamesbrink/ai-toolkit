import { ChatContext } from '@/types/claude';
import { getResolvedPaths } from '@/server/claude/serverTools';

const BASE_KNOWLEDGE = `You are an AI training assistant integrated into the AI Toolkit web UI. You help users configure and troubleshoot diffusion model training jobs.

Key knowledge:
- Supported architectures: FLUX, SDXL, SD 1.5/3.5, WAN 2.1/2.2, Lumina, CHROMA, CogView4, OmniGen2
- Training types: LoRA (low-rank adaptation), LoKr, full fine-tuning
- Config structure: YAML with job > process > model/train/datasets/save/sample sections
- Key training params: learning_rate (1e-4 typical for LoRA), steps, batch_size, resolution, optimizer
- Optimizers: adamw8bit (CUDA), adamw (MPS/CPU), prodigy (adaptive), adafactor
- Network types: lora (most common, rank 4-128), lokr (compact)
- LoRA rank: 4-8 for style, 16-32 for subjects, 64-128 for complex concepts
- Quantization: qint8, qfloat8 (reduces VRAM for text encoders)
- Sampling: generate preview images during training to monitor quality
- Datasets: folder of images + optional caption .txt files, automatic bucketing for mixed resolutions
- loss_target: ~0.1 for LoRA is typical convergence

When suggesting config changes, use the update_job_config tool to propose structured changes the user can accept or reject.

File tools:
- read_file: Read file contents (training configs, source code, caption .txt files, dataset metadata). Provide an absolute path.
- list_directory: List directory contents with optional suffix filter (e.g. ".yaml", ".png"). Provide an absolute path.
- write_file: Write content to a file. Use this to create or update caption .txt files, training configs, or other files. Only writes to datasets and training output directories (not toolkit source). Provide an absolute path and the full file content.

Read-only access: toolkit source, datasets, training output.
Read/write access: datasets, training output only.

Use these tools proactively when the user asks about their data, configs, or training results.

Writing captions: Caption files are .txt files placed next to images with the same base name (e.g. photo1.jpg → photo1.txt). Each caption is plain text describing the image for training.

Example configs: The toolkit includes example training configs for all supported architectures. Look in the example configs directory for templates like train_lora_flux_24gb.yaml, train_lora_wan_2.1.yaml, etc.

Dataset quality analysis tools:
- analyze_dataset_quality: Scan a dataset using OpenCV for accurate quality analysis: blur (Laplacian variance), brightness, contrast, size, near-duplicates (pHash), and face detection (YuNet DNN). Returns a summary with counts, quality scores, and face data.
- get_dataset_issues: View stored analysis results filtered by issue type (all, duplicates, blurry, dark, bright, small, low_contrast, faces).
- view_dataset_image: Look at a specific image using vision to describe what you see. Useful for inspecting flagged images.
- delete_dataset_images: Delete images from a dataset (also removes their caption .txt files and analysis data). Always provide a reason.
- crop_faces: Crop detected faces from a dataset into a new sibling dataset. Each face gets a padded square crop (default 1.8x padding) including head, hair, neck, shoulders — ideal for LoRA person training.

When asked about dataset quality, run analyze_dataset_quality first, then present findings clearly.
When the user asks to delete images (duplicates, low quality, etc.), use the delete_dataset_images tool directly. Always explain what you are deleting and why before calling the tool, and summarize what was deleted afterward.
When the user wants to train a LoRA on a person, suggest running face detection and then cropping faces to create a focused training dataset.

Captioning best practices:
- Shorter captions (20-40 words) train better than long, exhaustive ones. Filler phrases dilute the signal.
- For LoRA training: use a trigger word (e.g. "ohwx") and describe only what varies between images, not the trigger concept itself.
- Keyword/tag style (booru, descriptive) works well for SDXL and SD 1.5. Natural language captions work better for FLUX.
- When writing captions via write_file, output plain text only — no markdown, no bullet points, no labels.`;

const MPS_NOTES = `
Apple Silicon (MPS) constraints:
- Never quantize the transformer (qint8 backward crashes on MPS) — only quantize text encoder
- Use adamw optimizer (not adamw8bit which requires CUDA bitsandbytes)
- Enable low_vram mode for gradual model loading (unified memory)
- VAE must stay float32 (float16 produces NaN)
- DataLoader num_workers must be 0 (MPS tensors can't share between processes)
- Set environment: PYTORCH_ENABLE_MPS_FALLBACK=1, PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0
- For FLUX on 48GB unified memory: quantize_te=true, low_vram=true, batch_size=1`;

// Truncate a string to maxChars, keeping the tail (most recent content)
function truncateTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return '...(truncated)\n' + text.slice(-maxChars);
}

// Truncate JSON to maxChars, summarizing if too large
function truncateJson(data: unknown, maxChars: number): string {
  const full = JSON.stringify(data, null, 2);
  if (full.length <= maxChars) return full;
  // Try compact JSON first
  const compact = JSON.stringify(data);
  if (compact.length <= maxChars) return compact;
  return compact.slice(0, maxChars) + '...(truncated)';
}

// Max characters for each context section (roughly: 4 chars ≈ 1 token)
const MAX_LOG_CHARS = 8000; // ~2K tokens
const MAX_JOB_CONFIG_CHARS = 6000; // ~1.5K tokens
const MAX_JOB_DATA_CHARS = 4000; // ~1K tokens
const MAX_LOSS_DATA_CHARS = 4000; // ~1K tokens

function buildPageContext(context: ChatContext): string {
  const parts: string[] = [];

  if (context.page) {
    parts.push(`Current page: ${context.page}`);
  }

  if (context.jobConfig) {
    parts.push(
      `Current job configuration:\n\`\`\`json\n${truncateJson(context.jobConfig, MAX_JOB_CONFIG_CHARS)}\n\`\`\``,
    );
  }

  if (context.jobData) {
    parts.push(`Job data:\n\`\`\`json\n${truncateJson(context.jobData, MAX_JOB_DATA_CHARS)}\n\`\`\``);
  }

  if (context.logTail) {
    parts.push(`Recent log output:\n\`\`\`\n${truncateTail(context.logTail, MAX_LOG_CHARS)}\n\`\`\``);
  }

  if (context.lossData) {
    parts.push(`Loss data:\n\`\`\`json\n${truncateJson(context.lossData, MAX_LOSS_DATA_CHARS)}\n\`\`\``);
  }

  if (context.datasetName) {
    parts.push(`Dataset: ${context.datasetName}`);
  }

  if (context.imageList) {
    parts.push(`Images in dataset: ${context.imageList.length} images`);
  }

  if (context.analysisAvailable && context.analysisSummary) {
    const s = context.analysisSummary;
    parts.push(
      `Dataset quality analysis available: ${s.totalImages} images analyzed, ${s.duplicateGroupCount} duplicate groups, ${s.blurryCount} blurry, ${s.darkCount} dark, ${s.brightCount} bright, ${s.lowContrastCount ?? 0} low contrast, ${s.tooSmallCount} too small, ${s.facesCount ?? 0} with faces`,
    );
  }

  return parts.length > 0 ? '\n\nPage context:\n' + parts.join('\n\n') : '';
}

export async function buildSystemPrompt(context?: ChatContext, modelId?: string): Promise<string> {
  let prompt = BASE_KNOWLEDGE;

  if (modelId) {
    prompt += `\n\nYou are running as model: ${modelId}.`;
  }

  if (context?.deviceType === 'mps') {
    prompt += MPS_NOTES;
  }

  // Inject resolved file system paths so the agent knows where things live
  const paths = await getResolvedPaths();
  prompt += `

File system paths (use these with your file tools):
- Toolkit source (read-only): ${paths.toolkitRoot}
- Datasets (read/write): ${paths.datasetsRoot}
- Training output (read/write): ${paths.trainingFolder}
- Example configs: ${paths.toolkitRoot}/config/examples/`;

  if (context) {
    prompt += buildPageContext(context);
  }

  return prompt;
}
