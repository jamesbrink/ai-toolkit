# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Toolkit (by Ostris) is a training suite for diffusion models supporting image and video generation. It handles LoRA, LoKr, and full fine-tuning across multiple model architectures (FLUX, SDXL, SD 1.5/3.5, WAN 2.1/2.2, Lumina, CHROMA, CogView4, OmniGen2, etc.). This is a fork of the upstream repo.

## Commands

### Running a training job
```bash
python run.py config/your_config.yaml
```
Multiple configs can be chained: `python run.py config1.yaml config2.yaml`
Use `-r` to continue on failure, `-n <name>` to replace `[name]` tags in config.

### Installation (Python 3.10+)
```bash
python3 -m venv venv && source venv/bin/activate
pip3 install --no-cache-dir torch==2.7.0 torchvision==0.22.0 torchaudio==2.7.0 --index-url https://download.pytorch.org/whl/cu126
pip3 install -r requirements.txt
```

### Web UI
```bash
cd ui && npm install && npm run build && npm run update_db && npm start
# Access at http://localhost:8675
```

### Docker
```bash
docker-compose up  # Requires NVIDIA GPU runtime, exposes port 8675
```

### Debug mode
Set `DEBUG_TOOLKIT=1` to enable PyTorch anomaly detection.

### No test suite
There are no automated tests in this repo. Validation is done by running training jobs with example configs from `config/examples/`.

## Architecture

### Execution flow
```
run.py → toolkit/job.py:get_job(config) → Job → Process.run()
```

Config YAML determines the job type (`extension`, `train`, `extract`, `generate`, `mod`). Almost all training uses job type `extension` with process type `sd_trainer`.

### Config system (`toolkit/config.py`, `toolkit/config_modules.py`)
- YAML/JSON configs with `${ENV_VAR}` substitution (loaded from `.env` via python-dotenv)
- `[name]` tag in configs replaced at load time with `config.name` or `-n` CLI arg
- Config paths resolve against `config/` directory first, then as absolute/relative paths
- Key config dataclasses: `TrainConfig`, `ModelConfig`, `DatasetConfig`, `NetworkConfig`, `SaveConfig`, `SampleConfig`

### Extension system (`toolkit/extension.py`)
Extensions live in `extensions_built_in/` (shipped) and `extensions/` (user-created, gitignored). Each extension module exports `AI_TOOLKIT_EXTENSIONS` list. Extensions register a `uid` and return a Process class via `get_process()`. Discovery is automatic via `pkgutil.iter_modules`.

### Key class hierarchy

**Jobs** (`jobs/`):
- `BaseJob` → `ExtensionJob` (most training), `TrainJob`, `ExtractJob`, `GenerateJob`, `ModJob`

**Processes** (`jobs/process/`):
- `BaseProcess` → `BaseTrainProcess` → `BaseSDTrainProcess`
- The main trainer is `SDTrainer` in `extensions_built_in/sd_trainer/SDTrainer.py` (~2100 lines) — this contains the core training loop

**Models** (`toolkit/models/`):
- `BaseModel` (`base_model.py`) — handles loading, pipeline setup, device management, gradient checkpointing, network (LoRA) attachment
- Subclasses: `Flux`, `Wan21`, `CogView4`, etc. in their respective files/directories
- `StableDiffusion` (`toolkit/stable_diffusion_model.py`, ~3150 lines) — inference/sampling, embedding caching, adapter management

### Training pipeline
1. Config loaded and preprocessed
2. `ExtensionJob` finds the `sd_trainer` extension, instantiates `SDTrainer`
3. Model loaded (with optional quantization), LoRA/LoKr network attached
4. Datasets loaded with bucket-based batching for variable resolutions
5. Latents and text embeddings cached to disk
6. Training loop: forward pass → diffusion loss → backward → optimizer step → EMA update → periodic sampling/checkpointing

### LoRA/LoKr (`toolkit/kohya_lora.py`, `toolkit/models/lora*.py`)
- LoRA replaces linear/conv layers with low-rank decomposition
- Layer targeting via `only_if_contains` / `ignore_if_contains` patterns on layer names in network config
- Supports rank dropout, module dropout

### Data loading (`toolkit/data_loader.py`)
- `ImageDataset` handles image/caption pairs
- Bucket-based batching groups images by similar aspect ratios
- Latent caching and text embedding caching to disk for performance
- Augmentations via Albumentations library

### Important directories
- `toolkit/` — core framework (config, data loading, models, schedulers, training utilities)
- `extensions_built_in/` — shipped extensions (`sd_trainer`, `diffusion_models`, `dataset_tools`, `flex2`, etc.)
- `extensions/` — user extensions (gitignored except `extensions/example`)
- `jobs/` — job types and process base classes
- `config/examples/` — reference training configs for all supported models
- `ui/` — Next.js web UI (port 8675)

### Environment variables
- `HF_HUB_ENABLE_HF_TRANSFER=1` — set automatically in `run.py` for fast downloads
- `DEBUG_TOOLKIT=1` — enables torch anomaly detection
- `AI_TOOLKIT_AUTH` — auth password for the web UI (used in docker-compose)
- Standard HuggingFace env vars (`HF_TOKEN`, etc.) for gated model access
