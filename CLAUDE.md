# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Toolkit (by Ostris) is a training suite for diffusion models supporting image and video generation. It handles LoRA, LoKr, and full fine-tuning across multiple model architectures (FLUX, SDXL, SD 1.5/3.5, WAN 2.1/2.2, Lumina, CHROMA, CogView4, OmniGen2, etc.). This is a fork of the upstream repo.

**Branch `flake-nix-mps`**: Adds Nix packaging and Apple Silicon (MPS) training support.

## Commands

### Nix build and run (preferred)
```bash
nix build                                    # Build ai-toolkit Python package
nix build .#ui                               # Build Next.js web UI
nix build .#docker                           # Build Docker image (Linux only)
nix run . -- config/your_config.yaml         # Run training
nix run .#ui                                 # Start web UI on port 8675
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
  nix run . -- config/your_config.yaml
```
Set `device: mps` in config YAML. Use `low_vram: true` and `quantize_te: true` for FLUX on 48GB.

### Web UI (development)
```bash
cd ui && npm install && npm run build && npm run update_db && npm start
# Access at http://localhost:8675
```

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
nix build .#ai-toolkit         # Rebuild Python package (picks up toolkit/ changes)
nix build .#ui                 # Rebuild UI (picks up ui/ changes)
```
Source filtering in both derivations excludes: `node_modules`, `venv`, `output`, `.git`, `__pycache__`, `.pyc`

## Important directories
- `toolkit/` — core framework (config, data loading, models, schedulers, training utilities)
- `extensions_built_in/` — shipped extensions (`sd_trainer`, `diffusion_models`, `dataset_tools`, etc.)
- `extensions/` — user extensions (gitignored except `extensions/example`)
- `jobs/` — job types and process base classes
- `config/examples/` — reference training configs for all supported models
- `ui/` — Next.js web UI (Tailwind 4.1, Prisma 6, HeadlessUI)
- `ui/src/components/` — key UI components: `Sidebar.tsx` (responsive 3-mode nav), `SidebarContext.tsx` (drawer state), `Skeleton.tsx` (loading states), `formInputs.tsx` (form controls + react-select dark styles), `JobActionBar.tsx` (job controls), `SampleImages.tsx` (responsive image grid), `layout.tsx` (TopBar/MainContent with hamburger menu)
- `nix/` — Nix packaging derivations and wrapper scripts

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
- Standard HuggingFace env vars (`HF_TOKEN`, etc.) for gated model access
