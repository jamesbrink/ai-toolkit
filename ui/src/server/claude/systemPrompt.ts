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
- analyze_dataset_quality: Scan a dataset for near-duplicate images and quality issues (blur, brightness, size). Returns a summary with counts and details.
- get_dataset_issues: View stored analysis results filtered by issue type (all, duplicates, blurry, dark, bright, small).
- view_dataset_image: Look at a specific image using vision to describe what you see. Useful for inspecting flagged images.

When asked about dataset quality, run analyze_dataset_quality first, then present findings clearly.
Always confirm with the user before proposing image deletions via delete_dataset_images.`;

const MPS_NOTES = `
Apple Silicon (MPS) constraints:
- Never quantize the transformer (qint8 backward crashes on MPS) — only quantize text encoder
- Use adamw optimizer (not adamw8bit which requires CUDA bitsandbytes)
- Enable low_vram mode for gradual model loading (unified memory)
- VAE must stay float32 (float16 produces NaN)
- DataLoader num_workers must be 0 (MPS tensors can't share between processes)
- Set environment: PYTORCH_ENABLE_MPS_FALLBACK=1, PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0
- For FLUX on 48GB unified memory: quantize_te=true, low_vram=true, batch_size=1`;

function buildPageContext(context: ChatContext): string {
  const parts: string[] = [];

  if (context.page) {
    parts.push(`Current page: ${context.page}`);
  }

  if (context.jobConfig) {
    parts.push(`Current job configuration:\n\`\`\`json\n${JSON.stringify(context.jobConfig, null, 2)}\n\`\`\``);
  }

  if (context.jobData) {
    parts.push(`Job data:\n\`\`\`json\n${JSON.stringify(context.jobData, null, 2)}\n\`\`\``);
  }

  if (context.logTail) {
    parts.push(`Recent log output:\n\`\`\`\n${context.logTail}\n\`\`\``);
  }

  if (context.lossData) {
    parts.push(`Loss data:\n\`\`\`json\n${JSON.stringify(context.lossData, null, 2)}\n\`\`\``);
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
      `Dataset quality analysis available: ${s.totalImages} images analyzed, ${s.duplicateGroupCount} duplicate groups, ${s.blurryCount} blurry, ${s.darkCount} dark, ${s.brightCount} bright, ${s.tooSmallCount} too small`
    );
  }

  return parts.length > 0 ? '\n\nPage context:\n' + parts.join('\n\n') : '';
}

export async function buildSystemPrompt(context?: ChatContext): Promise<string> {
  let prompt = BASE_KNOWLEDGE;

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
