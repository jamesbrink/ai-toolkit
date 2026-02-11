# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Toolkit (by Ostris) is a training suite for diffusion models supporting image and video generation. It handles LoRA, LoKr, and full fine-tuning across multiple model architectures (FLUX, SDXL, SD 1.5/3.5, WAN 2.1/2.2, Lumina, CHROMA, CogView4, OmniGen2, etc.). This is a fork of the upstream repo.

**Branch `flake-nix-mps`**: Adds Nix packaging and Apple Silicon (MPS) training support.

## Commands

### Nix build and run (preferred)
```bash
nix build                                    # Build Next.js web UI (default target)
nix build .#ai-toolkit                       # Build Python training package
nix build .#docker                           # Build Docker image (Linux only)
nix run                                      # Start web UI on port 8675 (default target)
nix run .#train -- config/your_config.yaml   # Run training
nix run .#gradio                             # Start Gradio UI
nix develop                                  # Dev shell with Python 3.12, Node 22
```

### Running a training job
```bash
python run.py config/your_config.yaml
```
Multiple configs can be chained: `python run.py config1.yaml config2.yaml`
Use `-r` to continue on failure, `-n <name>` to replace `[name]` tags in config.

### MPS training (Apple Silicon)
```bash
PYTORCH_ENABLE_MPS_FALLBACK=1 PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0 \
  nix run .#train -- config/your_config.yaml
```
Set `device: mps` in config YAML. Use `low_vram: true` and `quantize_te: true` for FLUX on 48GB.

### Web UI (development)
```bash
cd ui && npm install && npm run update_db         # One-time setup (Prisma generate + DB push)
cd ui && npm run dev                               # Dev mode with hot reload (Turbopack + ts-node-dev worker)
cd ui && npm run build && npm start                # Production build + start
cd ui && npm run build_and_start                   # All-in-one: install, migrate, build, start
cd ui && npm run lint                              # ESLint 9 flat config
cd ui && npm run format                            # Prettier (prettier-basic preset)
# Access at http://localhost:8675
```

### Docker (NVIDIA GPU)
```bash
docker compose up                              # Start UI with NVIDIA GPU passthrough
```
Mounts HuggingFace cache, SQLite DB, datasets, output, and config directories. Set `AI_TOOLKIT_AUTH` in environment for web UI password. See `docker-compose.yml` and `docker/Dockerfile` (CUDA 12.8.1 base).

### No test suite
There are no automated tests. Validation is done by running training jobs with example configs from `config/examples/`.

## Architecture

### Execution flow
```
run.py → toolkit/job.py:get_job(config) → Job → Process.run()
```
Config YAML determines the job type (`extension`, `train`, `extract`, `generate`, `mod`). Almost all training uses job type `extension` with process type `sd_trainer`.

### Key class hierarchy

**Models** — two parallel implementations with shared patterns:
- `BaseModel` (`toolkit/models/base_model.py`) — base class for newer model architectures
- `StableDiffusion` (`toolkit/stable_diffusion_model.py`, ~3200 lines) — FLUX, SDXL, SD, PixArt, AuraFlow, Lumina

Both contain: `flush()`, `_gradual_move_to_device()`, `set_device_state()`, `generate_images()`, `encode_images()`. Changes to device/memory management patterns must be mirrored in both files.

**Training**:
- `SDTrainer` (`extensions_built_in/sd_trainer/SDTrainer.py`, ~2100 lines) — core training loop
- `BaseSDTrainProcess` (`jobs/process/BaseSDTrainProcess.py`) — training infrastructure, optimizer, checkpointing

### Extension system
Extensions are loaded dynamically by `toolkit/extension.py:get_all_extensions()` which scans both `extensions_built_in/` and `extensions/` for packages exporting an `AI_TOOLKIT_EXTENSIONS` list. Each extension subclasses `Extension` with a unique `uid` and a `get_process()` classmethod that lazily imports its process class:
```python
class SDTrainerExtension(Extension):
    uid = "sd_trainer"
    name = "SD Trainer"
    @classmethod
    def get_process(cls):
        from .SDTrainer import SDTrainer
        return SDTrainer
AI_TOOLKIT_EXTENSIONS = [SDTrainerExtension]
```
Config YAML references extensions by `uid` in the `process` field. The `get_all_extensions_process_dict()` function builds the uid→process mapping used by `job.py` to dispatch jobs.

### Config system (`toolkit/config_modules.py`)
- YAML/JSON configs with `${ENV_VAR}` substitution (loaded from `.env`)
- `[name]` tag replaced at load time with `config.name` or `-n` CLI arg
- Key dataclasses: `TrainConfig`, `ModelConfig`, `DatasetConfig`, `NetworkConfig`, `SaveConfig`, `SampleConfig`

### flush() functions
There are **4 separate copies** of `flush()` that must stay in sync:
- `toolkit/basic.py` — imported by BaseSDTrainProcess and others
- `toolkit/stable_diffusion_model.py` — module-level, used by StableDiffusion
- `toolkit/models/base_model.py` — module-level, used by BaseModel
- `toolkit/control_generator.py` — module-level

All must handle MPS via `torch.mps.synchronize()` before `torch.mps.empty_cache()`.

## MPS (Apple Silicon) Support

### Known constraints
- **quanto qint8 backward crashes on MPS** — never quantize the transformer (`quantize: false`); only quantize the text encoder (`quantize_te: true`) since it's inference-only
- **torch.cat/stack SIGTRAP** — `run.py` patches these at startup with safe implementations + TorchDispatchMode for backward passes
- **VAE must stay float32 on MPS** — float16 VAE produces NaN. During sample generation, FLUX latents (float16) are manually decoded by casting to float32 before `vae.decode()` rather than casting the VAE down
- **DataLoader num_workers=0** — MPS tensors can't be shared between processes. Enforced in `config_modules.py` and `data_loader.py`
- **Unified memory** — CPU and MPS share 48GB RAM. `_gradual_move_to_device()` moves model children one-by-one to avoid 2x peak memory from `.to(device)`
- **`PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0`** — prevents MPS allocator from hoarding freed memory, critical for stable swap usage

### Environment variables for MPS
- `PYTORCH_ENABLE_MPS_FALLBACK=1` — falls back to CPU for unsupported MPS ops
- `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0` — prevents memory hoarding
- `AITK_FORCE_CPU=1` — forces CPU mode via Accelerator (bypass MPS entirely)
- `DEBUG_TOOLKIT=1` — enables PyTorch anomaly detection

### Device utility module (`toolkit/device_utils.py`)
MPS-aware wrappers: `is_mps_available()`, `is_cuda_available()`, `get_device()`, `get_device_name()`, `empty_cache()`, `manual_seed()`, `synchronize()`, `autocast()`.

## Nix Packaging

### Flake structure
```
flake.nix                     # Entry point, flake-parts based
├── nix/ai-toolkit.nix        # Python training CLI package
├── nix/ai-toolkit-ui.nix     # Next.js UI (buildNpmPackage)
├── nix/ai-toolkit-ui-wrapper.sh  # UI launch script (worker + server)
├── nix/python-packages.nix   # Python overlay (CUDA on Linux, missing packages)
└── nix/docker-image.nix      # Docker image (Linux only)
```

### Platform differences
- **Linux**: Uses `torch-bin` (pre-built CUDA wheels) via python-packages.nix overlay. `allowUnfree = true` for CUDA.
- **macOS (Darwin)**: Uses source-built torch from nixpkgs (MPS support via Metal). No CUDA.

### Key packages in overlay (`nix/python-packages.nix`)
Custom-built (not in nixpkgs): `lycoris-lora`, `prodigyopt`, `controlnet-aux`, `pytorch-fid`, `optimum-quanto`, `pytorch-wavelets`
Version-pinned: `albumentations` (1.4.15), `diffusers` (0.37.0.dev0 from git commit)

### UI package (`nix/ai-toolkit-ui.nix`)
- Built with `buildNpmPackage` + Node.js 22
- Prisma 6 for SQLite DB (engines provided by `prisma-engines_6` from nixpkgs)
- Next.js standalone output mode
- `npmDepsHash` must be updated when `ui/package-lock.json` changes: `nix build .#ui 2>&1 | grep 'got:'`

### UI wrapper (`nix/ai-toolkit-ui-wrapper.sh`)
- Creates writable data directory at `~/.local/share/ai-toolkit/` (datasets, output, DB)
- Sets `PYTHON_PATH` to the Nix ai-toolkit Python wrapper
- Runs `prisma db push` on startup for schema migrations
- Spawns both the Next.js server and cron worker as background processes

### Web UI architecture
Two concurrent processes:
1. **Next.js server** (port 8675) — web app, API routes, dashboard
2. **Cron worker** (`dist/cron/worker.js`) — polls SQLite DB, spawns `python run.py <config>` for training jobs

Python discovery in worker: `PYTHON_PATH` env var → `.venv/bin/python` → `venv/bin/python` → `python`
Path config: `TOOLKIT_ROOT` env var → `ui/cron/paths.ts` fallback

### UI job lifecycle (Prisma SQLite)
Six models in `ui/prisma/schema.prisma`:
- **Settings** — key-value store for app configuration (includes `INSTANCE_ID` for mDNS identity, `MDNS_ENABLED` toggle)
- **Queue** — one row per GPU set (`gpu_ids` unique), `is_running` flag tracks if a job is active on that queue
- **Job** — stores `job_config` (JSON string of training YAML), tracks `status` ("stopped", "queued", "running", "completed", "error"), `step`, `speed_string`, `queue_position`
- **ImageAnalysis** — per-image quality metrics: pHash, laplacianVariance, brightness, contrast, boolean flags (isBlurry, isDark, isBright, isLowContrast, isTooSmall, hasFaces), faceCount, facesJson, composite qualityScore (0-100). Keyed by `filePath` (unique), indexed by `datasetName`, `pHash`, `qualityScore`, `hasFaces`
- **DuplicateGroup** — groups of near-duplicate images: `imagePaths` (JSON array), `maxSimilarity` (float), `dismissed` flag. Keyed by `groupHash` (unique, sorted paths joined by `|`)
- **Host** — remote AI Toolkit instances: `name`, `address`, `port`, `authToken`, `instanceId` (unique, for dedup), `source` ("mdns"/"manual"), `isOnline`, `isHidden`, `deviceType`, `gpuSummary` (JSON), `lastSeen`. Indexed by `[address, port]` and `[isOnline]`

Job flow: UI creates Job with status "queued" → cron worker polls for queued jobs → finds free Queue (matching `gpu_ids`, `is_running=false`) → spawns `python run.py <config>` → sets `is_running=true` → monitors process → on exit sets status and `is_running=false`. The `stop` flag signals graceful stop; `return_to_queue` re-queues instead of stopping.

### Web UI technology stack
- **Tailwind CSS 4.1** — CSS-first config via `@import "tailwindcss"` in `globals.css`. No `tailwind.config.ts` (deleted during v3→v4 migration). Theme defined in `@theme` block in `globals.css`. PostCSS uses `@tailwindcss/postcss` plugin.
- **Responsive sidebar** — 3 modes: mobile drawer (<768px, HeadlessUI `Dialog`), tablet icon rail (768–1024px, expands on hover), desktop full-width (>1024px). State managed by `SidebarContext.tsx` / `SidebarProvider`.
- **Dynamic viewport height** — `h-dvh` (not `h-screen`) in root layout for correct mobile browser behavior.
- **react-select dark theme** — Default inline `style` attributes from react-select can't be overridden by CSS classes. The `styles` prop in `formInputs.tsx` (`reactSelectDarkStyles` object) is required for dark mode.
- **WCAG AA contrast** — All text uses `text-gray-400` (#a3a3a3) or lighter on dark backgrounds (~7.3:1 ratio). Avoid `text-gray-500` (#737373) which only achieves ~3.8:1 (fails WCAG AA 4.5:1 requirement).
- **Skeleton loading states** — `Skeleton.tsx` provides `GPUWidgetSkeleton`, `TableSkeleton`, `JobOverviewSkeleton` presets with shimmer animation.
- **MPS detection in UI** — `useGPUInfo` hook returns `deviceType: 'mps'` on Apple Silicon. The job creation page auto-applies MPS-safe defaults (adamw optimizer, no transformer quantization, low_vram mode).

### Rebuilding after changes
```bash
nix build                      # Rebuild UI (default target, picks up ui/ changes)
nix build .#ai-toolkit         # Rebuild Python package (picks up toolkit/ changes)
```
Source filtering in both derivations excludes: `node_modules`, `venv`, `output`, `.git`, `__pycache__`, `.pyc`

## Important directories
- `toolkit/` — core framework (config, data loading, models, schedulers, training utilities)
- `toolkit/dataset_analysis.py` — Python OpenCV script for quality metrics + YuNet face detection (called by Node.js via child process)
- `extensions_built_in/` — shipped extensions (`sd_trainer`, `diffusion_models`, `dataset_tools`, etc.)
- `extensions/` — user extensions (gitignored except `extensions/example`)
- `jobs/` — job types and process base classes
- `config/examples/` — reference training configs for all supported models
- `ui/` — Next.js web UI (Tailwind 4.1, Prisma 6, HeadlessUI)
- `ui/src/components/` — key UI components: `Sidebar.tsx` (responsive 3-mode nav), `SidebarContext.tsx` (drawer state), `Skeleton.tsx` (loading states), `formInputs.tsx` (form controls + react-select dark styles), `JobActionBar.tsx` (job controls), `SampleImages.tsx` (responsive image grid), `layout.tsx` (TopBar/MainContent with hamburger menu), `DatasetAnalysisPanel.tsx` (quality analysis modal with Summary/Duplicates/Faces/Quality Issues tabs, bulk actions), `DuplicateGroupCard.tsx` (duplicate group thumbnails with select/dismiss, `bg-gray-700` fallback + `onError` for broken images)
- `ui/src/components/claude/` — Claude integration components: `CaptionHelper.tsx` (batch caption modal with style selector, accept/reject per-image, "Apply All" button), `ChatPanel.tsx` (chat UI), `ClaudeChatContext.tsx` (chat state), `DeleteProposal.tsx` (deletion confirmation UI)
- `ui/cron/mdns.ts` — mDNS advertise + discover module (bonjour-service)
- `ui/cron/actions/checkHosts.ts` — periodic host health checker
- `nix/` — Nix packaging derivations and wrapper scripts

## Claude AI Integration (Chat & Captions)

### Architecture
The web UI integrates Claude as a chat assistant and image captioner via the Anthropic SDK. Key files:
- `ui/src/server/claude/client.ts` — SDK client factory with OAuth custom fetch interceptor
- `ui/src/server/claude/serverTools.ts` — server-side tools (`read_file`, `list_directory`, `write_file`, `analyze_dataset_quality`, `get_dataset_issues`, `view_dataset_image`, `crop_faces`, `delete_dataset_images`)
- `ui/src/server/claude/systemPrompt.ts` — async system prompt builder (injects resolved paths)
- `ui/src/server/claude/captionPrompts.ts` — caption system prompt, style-specific prompts, refusal detection
- `ui/src/app/api/claude/chat/route.ts` — chat API route (agentic tool loop)
- `ui/src/app/api/claude/caption/route.ts` — single image caption route (with refusal retry)
- `ui/src/app/api/claude/caption/batch/route.ts` — batch caption route (NDJSON streaming, with refusal retry)

### Caption prompt system
`captionPrompts.ts` defines the captioning behavior:
- **`captionSystemPrompt`** — system prompt establishing context for captioning routes. Instructs Claude to produce factual visual descriptions using neutral artistic language and never refuse.
- **`captionPrompts`** — record of style-specific user prompts: `descriptive` (20-40 word comma-separated phrases), `booru` (danbooru-style tags), `natural` (single sentence for FLUX), `trigger` (trigger word + variable attributes only).
- **`fallbackCaptionPrompt`** — focused prompt used on retry when the primary caption is refused. Asks only for visual attributes (face, hair, pose, clothing, setting).
- **`isRefusal(text)`** — regex-based detection of refusal patterns (e.g. "I can't provide", "not appropriate", "I need to decline"). Both caption routes check the initial response and retry with `fallbackCaptionPrompt` if a refusal is detected.

### Model selection
Two separate model settings (configurable in Settings UI):
- `CLAUDE_CHAT_MODEL` — chat assistant (default: Sonnet)
- `CLAUDE_CAPTION_MODEL` — image captioning (default: Haiku for speed/cost)

Both fall back to `CLAUDE_MODEL` env var if DB setting is empty.

### OAuth token support (Claude Code tokens)
When using `CLAUDE_CODE_OAUTH_TOKEN` instead of an API key, the custom fetch in `client.ts` transforms every request to pass Anthropic's Claude Code identity validation. **All of these are required — removing any one causes a 400 rejection:**

1. **System prompt must be an array, not a string.** The Claude Code prefix (`"You are Claude Code, Anthropic's official CLI for Claude."`) must be the first text block in its own array element. Our custom prompt goes in a second block. String concatenation (`prefix + "\n\n" + prompt`) fails because Anthropic checks that the first text block is *exactly* the prefix.
   ```json
   "system": [
     {"type": "text", "text": "You are Claude Code, Anthropic's official CLI for Claude."},
     {"type": "text", "text": "Your actual system prompt here..."}
   ]
   ```
2. **Tool names must be prefixed with `mcp__`** — e.g. `read_file` → `mcp__read_file`. Anthropic validates tool names against an allowlist for OAuth. The prefix is stripped from responses via regex.
3. **Beta headers** — both `oauth-2025-04-20` and `claude-code-20250219` must be in `anthropic-beta`.
4. **Auth header swap** — `x-api-key` removed, replaced with `Authorization: Bearer <token>`.
5. **User-Agent** — must be `claude-cli/2.1.2 (external, cli)`.
6. **URL parameter** — `?beta=true` appended to `/v1/messages`.
7. **Temperature must be absent** — `delete parsed.temperature` (not just default).

### Server tools and path resolution
- `serverTools.ts` uses async `getDatasetsRoot()` / `getTrainingFolder()` from `settings.ts` (checks Prisma DB, falls back to env/defaults). This ensures Settings UI overrides are respected.
- Read roots: `TOOLKIT_ROOT` + datasets + training output. Write roots: datasets + training output only (TOOLKIT_ROOT excluded — may be read-only Nix store).
- Blocked patterns: `.env`, `node_modules`, `.git`, `__pycache__`, `.pyc`.
- `systemPrompt.ts` is async — it calls `getResolvedPaths()` and injects concrete directory paths into the prompt so the agent knows where to look.
- `isReadAllowed()` is exported for reuse by the `view_dataset_image` tool.

### Dataset quality analysis server tools
Five server tools for dataset quality analysis, executed in the agentic tool loop:
- **`analyze_dataset_quality`** — runs full analysis (pHash via Node.js, blur/brightness/contrast/face detection via Python OpenCV) on a dataset, returns summary. Supports `force` flag to skip incremental caching.
- **`get_dataset_issues`** — returns stored analysis filtered by `issue_type` (all, duplicates, blurry, dark, bright, small, low_contrast, faces).
- **`view_dataset_image`** — reads an image file, base64-encodes it, and makes a secondary Claude vision call (using the caption model) to describe the image. Lets the agent "see" specific images.
- **`crop_faces`** — crops detected faces from a dataset into a new sibling dataset. Each face gets a padded square crop (default 1.8x) including head, hair, neck, shoulders. Requires running `analyze_dataset_quality` first to detect faces. Delegates to `toolkit/dataset_analysis.py` in `face-crop` mode via `pythonAnalysis.ts`.
- **`delete_dataset_images`** — deletes images from a dataset (also removes caption .txt files and analysis data). Validates paths are under writable roots before deleting. Provides a reason and per-file deletion summary.

`delete_dataset_images` executes as a server tool directly in the agentic loop. A `DeleteProposal` UI component exists for potential future client-side confirmation flow but is not currently active (the `datasetTools` array is empty).

### Tool progress indicator
The chat route (`route.ts`) emits `tool_progress` events during the agentic tool loop, before each server tool executes. The `ClaudeChatContext` exposes `activeToolName` state, and `ChatPanel` renders a spinner with a human-readable label (e.g., "Analyzing dataset quality...", "Deleting images...") from the `TOOL_LABELS` map. The indicator clears when content blocks start arriving or the stream ends.

## Dataset Quality Analysis

### Architecture
Automated image quality analysis, face detection, and near-duplicate detection, accessible from the dataset detail page UI and via Claude chat tools. Uses a **hybrid Node.js + Python approach**: perceptual hashing runs in Node.js via `sharp`, while quality metrics (blur, brightness, contrast) and face detection run in Python via OpenCV.

Key files:
- `ui/src/server/imageAnalysis.ts` — Node.js pHash computation (DCT-based perceptual hash via sharp) and duplicate grouping (union-find)
- `ui/src/server/pythonAnalysis.ts` — spawns `toolkit/dataset_analysis.py` as a child process, streams NDJSON results
- `toolkit/dataset_analysis.py` — Python OpenCV script for blur (Laplacian variance), brightness, contrast, face detection (YuNet DNN), and face cropping
- `ui/src/server/datasetAnalysis.ts` — orchestrator (incremental analysis, merges pHash from Node.js with quality/face data from Python, Prisma persistence, duplicate grouping)
- `ui/src/app/api/datasets/analyze/route.ts` — NDJSON streaming analysis endpoint
- `ui/src/app/api/datasets/analysis/route.ts` — get stored results
- `ui/src/app/api/datasets/analysis/dismiss-group/route.ts` — dismiss duplicate group
- `ui/src/app/api/datasets/analysis/delete-images/route.ts` — bulk delete images + captions + analysis rows
- `ui/src/app/api/datasets/face-crop/route.ts` — NDJSON streaming face crop endpoint (delegates to Python)
- `ui/src/app/api/datasets/rename/route.ts` — POST with `{ oldName, newName }`, validates characters, checks for conflicts, path traversal protection
- `ui/src/app/api/datasets/export/route.ts` — POST with `{ datasetName, includeCaptions }`, creates ZIP via `archiver`, returns `{ zipPath, fileName }`
- `ui/src/app/api/datasets/list/route.ts` — GET, returns `{ name, imageCount, captionCount, totalSizeBytes, lastModified }[]` (not just strings)
- `ui/src/hooks/useDatasetAnalysis.ts` — React hook for analysis state/streaming
- `ui/src/hooks/useDatasetList.tsx` — React hook returning `DatasetInfo[]` with `{ name, imageCount, captionCount, totalSizeBytes, lastModified }`, exports `DatasetInfo` interface
- `ui/src/components/DatasetAnalysisPanel.tsx` — HeadlessUI Dialog modal (Summary/Duplicates/Faces/Quality Issues tabs) with bulk actions (Keep First in All, Dismiss All) and face crop dialog
- `ui/src/components/DuplicateGroupCard.tsx` — thumbnail grid for a duplicate group with `bg-gray-700` fallback + `onError` handler for broken images
- `ui/src/components/claude/CaptionHelper.tsx` — batch caption modal with style selector (descriptive/booru/natural/trigger), per-image accept/reject, "Apply All" button
- `ui/src/components/claude/DeleteProposal.tsx` — chat-integrated deletion confirmation UI
- `ui/src/components/claude/tools/datasetTools.ts` — client tool definition for `delete_dataset_images`

### Perceptual hashing (pHash)
DCT-based perceptual hash in `imageAnalysis.ts` (runs in Node.js):
1. Resize to 32x32 grayscale via sharp
2. Apply 2D Discrete Cosine Transform (pure JS, precomputed coefficient matrix)
3. Extract top-left 8x8 low-frequency coefficients (skip DC component)
4. Threshold at median → 64-bit binary → 16-char hex string

Near-duplicates are detected by hamming distance between pHashes. Threshold of 10 bits (out of 64) catches resized/recompressed/slightly cropped copies. Union-find groups transitively connected images.

### Quality metrics (Python OpenCV)
Quality metrics are computed by `toolkit/dataset_analysis.py` using OpenCV, called via `pythonAnalysis.ts`:
- **Blur detection**: Laplacian variance via `cv2.Laplacian(gray, cv2.CV_64F).var()`. Variance < 100 = blurry.
- **Brightness**: Mean pixel intensity of grayscale image. < 50 = dark, > 200 = bright.
- **Contrast**: Standard deviation of grayscale pixel intensities. < 20 = low contrast.
- **Size**: `min(width, height) < training_resolution` (default 512) = too small.
- **Face detection**: OpenCV YuNet DNN model (`cv2.FaceDetectorYN`). Downloads the ONNX model on first use to `~/.local/share/ai-toolkit/models/`. Returns face bounding boxes with confidence scores.
- **Quality score**: Starts at 100, subtract 30 (blurry), 15 (dark), 15 (bright), 15 (low contrast), 20 (too small). Minimum 0.

### Face cropping
Face crops are produced by `toolkit/dataset_analysis.py` in `face-crop` mode:
1. Detect faces using YuNet DNN
2. For each face, compute a padded square crop centered on the face (default 1.8x padding includes head, hair, neck, shoulders)
3. Resize crop to training resolution (default 512x512) using INTER_LANCZOS4
4. Save to output dataset directory, copy caption .txt files if present
The UI exposes this via the Faces tab in `DatasetAnalysisPanel.tsx` with a configuration dialog for output name, resolution, and padding.

### Incremental analysis
The orchestrator (`datasetAnalysis.ts`) checks `fileModifiedAt` against stored `ImageAnalysis` rows. Unchanged images are skipped unless `force: true`. Stale entries (deleted images) are cleaned up automatically.

### UI integration
- **"Analyze Quality" button** in dataset page TopBar opens the `DatasetAnalysisPanel` modal
- **Summary tab**: count cards (Total, Duplicates, Blurry, Dark, Bright, Low Contrast, Too Small, With Faces) + average quality score bar
- **Duplicates tab**: `DuplicateGroupCard` per group with thumbnails, similarity badge, "Keep First" / "Dismiss" per-group actions, plus bulk "Keep First in All" / "Dismiss All" buttons for all active groups
- **Faces tab**: face count display, "Crop Faces" button opens config dialog (output dataset name, training resolution, padding multiplier)
- **Quality Issues tab**: image grid with colored issue badges (blurry=red, dark/bright=yellow, low contrast/small=orange), multi-select for bulk deletion
- **Dataset detail page** (`ui/src/app/datasets/[datasetName]/page.tsx`): rename button (pen icon, uses `ConfirmModal` with input), "Export ZIP" button, real-time image deletion (removes from local state without full page refresh), "Caption with Claude" button opens `CaptionHelper` modal
- **Datasets list page** (`ui/src/app/datasets/page.tsx`): `UniversalTable` with columns for name, image count, caption count (with color-coded completion percentage), size, last modified. Per-row action buttons: export (ZIP download), rename, delete

### Claude integration
- `analyze_dataset_quality` server tool runs the full analysis pipeline
- `get_dataset_issues` server tool returns stored results filtered by issue type
- `view_dataset_image` server tool makes a vision API call to describe a specific image
- `crop_faces` server tool crops detected faces into a new dataset
- `delete_dataset_images` server tool deletes images directly (validates paths under writable roots)
- Dataset page sets chat context (`datasetName`, `imageList`) via `useClaudeChat`
- System prompt (`systemPrompt.ts`) includes analysis tool descriptions and context about available results
- Tool progress events show spinner indicators in ChatPanel during server-side tool execution

### Hooks
- **`useDatasetAnalysis`** — returns `{ status, result, progress, error, startAnalysis, getStoredResults, dismissGroup, dismissAllGroups, deleteImages, cropFaces, exportDataset }`
- **`useDatasetList`** — returns `{ datasets: DatasetInfo[], setDatasets, status, refreshDatasets }`. Exports `DatasetInfo` interface with `{ name, imageCount, captionCount, totalSizeBytes, lastModified }`
- **`useHostList`** — polls `/api/hosts` every 10s. Returns `{ hosts: HostInfo[], status, refreshHosts }`. Exports `HostInfo` interface with `{ id, name, address, port, instanceId, source, isOnline, deviceType, gpuSummary, lastSeen }`
- **`useRemoteGPUInfo`** — polls remote GPU data via proxy (3s interval). Returns `{ gpuList, status, deviceType, refreshGpuInfo }`
- **`useRemoteJobs`** — polls remote jobs via proxy (5s interval). Returns `{ jobs, status, refreshJobs }`
- **`useRemoteQueue`** — fetches remote queue status via proxy. Returns `{ queue, status, refreshQueue }`

## Multi-Host Management

### Architecture
Each AI Toolkit instance can discover and manage other instances on the LAN. The "hub" instance proxies all API calls server-side (no CORS, auth tokens stay server-side). Each instance keeps its own SQLite DB — no shared database.

```
                         LAN (mDNS: _ai-toolkit._tcp)
    ┌─────────────────────────────────────────────────────┐
    │  ┌──────────────┐    ┌──────────────┐    ┌────────┐ │
    │  │ Hub Instance │    │ Worker Host  │    │ Host N │ │
    │  │ (this UI)    │◄──►│ (discovered) │    │(manual)│ │
    │  │ port 8675    │    │ port 8675    │    │        │ │
    │  └──────┬───────┘    └──────────────┘    └────────┘ │
    │         │                                           │
    │    SQLite (Host table)                              │
    │    Proxy: /api/hosts/{id}/proxy/* → remote /api/*   │
    └─────────────────────────────────────────────────────┘
```

### mDNS Discovery
- **`ui/cron/mdns.ts`** — advertises via Bonjour/mDNS (type `ai-toolkit`) and browses for other instances
- Uses `bonjour-service` (pure JS, no native deps, Nix-safe)
- `INSTANCE_ID` stored in Settings table (UUID, created on first run) for dedup across mDNS + manual add
- Self-skip by comparing instanceId in TXT record
- Controlled by `AI_TOOLKIT_MDNS` env var and `MDNS_ENABLED` Settings key
- Service up → upsert Host (source: 'mdns', isOnline: true); service down → mark offline

### Host Health Checker
- **`ui/cron/actions/checkHosts.ts`** — runs every ~30s (counter-based in worker loop)
- Fetches `/api/hosts/identify` from each non-hidden host with 5s timeout
- Tracks consecutive failures in-memory; marks offline after 3 consecutive failures
- Sends stored `authToken` as Bearer header

### Worker Integration
- **`ui/cron/worker.ts`** — calls `startMdns()` on startup (fire-and-forget), `stopMdns()` on shutdown
- `hostCheckCounter` increments each 1s loop iteration, triggers `checkHosts()` every 30 iterations

### API Routes
- **`/api/hosts/identify`** (GET) — returns `{ instanceId, hostname, version, deviceType, port }`. Used by health checker and manual host addition.
- **`/api/hosts`** (GET) — list non-hidden hosts. (POST) — create manual host, probes remote identity first.
- **`/api/hosts/[hostId]`** (GET/PATCH/DELETE) — single host CRUD. PATCH accepts `{ name?, authToken?, isHidden? }`.
- **`/api/hosts/[hostId]/proxy/[...path]`** (GET/POST/PATCH/DELETE) — forwards to `http://{host.address}:{host.port}/api/{...path}`. 10s timeout, auth token injection, binary response passthrough. Blocks `.env`, `node_modules`, `.git`, `__pycache__`, `.pyc` paths.
- **`/api/hosts/aggregate`** (GET) — fetches `/api/gpu` + `/api/jobs` from all online hosts in parallel, returns aggregated summary.

### UI Components
- **Sidebar** — "Hosts" nav item with `Network` icon between Training Queue and Datasets
- **`HostCard.tsx`** — card with name, address:port, online/offline status, source badge (mDNS/Manual), device type, GPU summary, actions (edit/hide/remove)
- **`HostSummaryCard.tsx`** — compact card for dashboard network overview
- **Hosts page** (`/hosts`) — grid of HostCards, "Add Host" button (address:port input via ConfirmModal), empty state
- **Host detail page** (`/hosts/[hostId]`) — connection info, online status, back navigation
- **Dashboard** — network section shows HostSummaryCards (only when hosts exist)
- **Settings** — mDNS enabled/disabled toggle in Network section
- **`remoteApi.ts`** — utility wrapping `apiClient` for proxy routes: `remoteApi.get(hostId, path)`, `remoteApi.post(hostId, path, data)`

### Known Limitations
- mDNS only works on same subnet (Docker needs `--network=host` or macvlan)
- Auth token exchange is manual (copy-paste in host edit)
- Each instance maintains its own SQLite — no shared state

## Environment variables
- `HF_HUB_ENABLE_HF_TRANSFER=1` — set automatically in `run.py` for fast downloads
- `AI_TOOLKIT_AUTH` — auth password for the web UI (used in docker-compose)
- `DATABASE_URL` — SQLite path for UI (set by Nix wrapper)
- `TOOLKIT_ROOT` — path to ai-toolkit source (set by Nix wrapper)
- `PYTHON_PATH` — Python binary for UI worker to spawn training jobs
- `AI_TOOLKIT_UI_DATA` — override writable data directory (default: `~/.local/share/ai-toolkit`)
- `AI_TOOLKIT_UI_HOST` — override UI bind address (default: `0.0.0.0`)
- `DATASETS_FOLDER` — override datasets directory (default: `$AI_TOOLKIT_UI_DATA/datasets`)
- `TRAINING_FOLDER` — override training output directory (default: `$AI_TOOLKIT_UI_DATA/output`)
- `DATA_ROOT` — override general data directory (default: `$AI_TOOLKIT_UI_DATA/data`)
- `PORT` — override UI port (default: `8675`)
- `CLAUDE_CODE_OAUTH_TOKEN` — Claude Code OAuth token (fallback when no API key configured)
- `CLAUDE_MODEL` — override default Claude model for all routes (fallback for per-task settings)
- `AI_TOOLKIT_MDNS` — set to `false` to disable mDNS discovery/advertising (default: enabled). Also controllable via Settings UI (`MDNS_ENABLED` key)
- Standard HuggingFace env vars (`HF_TOKEN`, etc.) for gated model access
