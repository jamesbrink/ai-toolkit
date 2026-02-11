import { ChatContext } from '@/types/claude';

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

When suggesting config changes, use the update_job_config tool to propose structured changes the user can accept or reject.`;

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

  return parts.length > 0 ? '\n\nPage context:\n' + parts.join('\n\n') : '';
}

export function buildSystemPrompt(context?: ChatContext): string {
  let prompt = BASE_KNOWLEDGE;

  if (context?.deviceType === 'mps') {
    prompt += MPS_NOTES;
  }

  if (context) {
    prompt += buildPageContext(context);
  }

  return prompt;
}
