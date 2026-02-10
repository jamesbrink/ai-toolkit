# Main ai-toolkit package derivation
{ lib
, stdenv
, makeWrapper
, python3
, ffmpeg-full
, git
}:

let
  pythonEnv = python3.withPackages (ps: with ps; [
    # Core ML
    torch
    torchvision
    torchaudio
    torchao

    # Diffusion / HuggingFace ecosystem
    safetensors
    diffusers
    transformers
    accelerate
    peft
    huggingface-hub
    hf-transfer

    # LoRA / fine-tuning
    lycoris-lora
    optimum-quanto
    bitsandbytes

    # Optimizers
    prodigyopt

    # Image / video processing
    albumentations
    albucore
    opencv4
    pillow
    av
    # torchcodec — skipped: cmake build against torch-bin's CUDA Caffe2 is
    # problematic in the Nix sandbox. Only needed for video model training.
    kornia
    controlnet-aux
    invisible-watermark
    pytorch-wavelets

    # Evaluation metrics
    lpips
    pytorch-fid

    # Schedulers / diffusion utilities
    k-diffusion
    open-clip-torch
    timm

    # Config / serialization
    pyyaml
    oyaml
    toml
    pydantic
    omegaconf
    python-dotenv
    flatten-json

    # Utilities
    einops
    sentencepiece
    tensorboard
    matplotlib
    scipy
    numpy
    setuptools
    python-slugify
    gradio
    tqdm
  ]);

  version = "0.7.22";
in
stdenv.mkDerivation {
  pname = "ai-toolkit";
  inherit version;

  src = lib.cleanSourceWith {
    src = ./..;
    filter = path: type:
      let baseName = baseNameOf path; in
      !(baseName == "venv" || baseName == ".venv"
        || baseName == "output" || baseName == ".direnv"
        || baseName == "result" || baseName == "node_modules"
        || baseName == "__pycache__" || baseName == ".git"
        || baseName == "aitk_db.db"
        || lib.hasSuffix ".pyc" baseName);
  };

  nativeBuildInputs = [ makeWrapper ];

  dontBuild = true;
  dontConfigure = true;

  installPhase = ''
    runHook preInstall

    # Copy source tree into the store
    mkdir -p $out/lib/ai-toolkit
    cp -r . $out/lib/ai-toolkit/

    mkdir -p $out/bin

    # Main training CLI wrapper
    makeWrapper ${pythonEnv}/bin/python $out/bin/ai-toolkit-train \
      --add-flags "$out/lib/ai-toolkit/run.py" \
      --prefix PATH : ${lib.makeBinPath [ ffmpeg-full git ]} \
      --set-default HF_HUB_ENABLE_HF_TRANSFER "1" \
      --set-default NO_ALBUMENTATIONS_UPDATE "1" \
      --set-default DISABLE_TELEMETRY "YES"

    # Gradio UI wrapper
    makeWrapper ${pythonEnv}/bin/python $out/bin/ai-toolkit-gradio \
      --add-flags "$out/lib/ai-toolkit/flux_train_ui.py" \
      --prefix PATH : ${lib.makeBinPath [ ffmpeg-full git ]} \
      --set-default HF_HUB_ENABLE_HF_TRANSFER "1" \
      --set-default NO_ALBUMENTATIONS_UPDATE "1" \
      --set-default DISABLE_TELEMETRY "YES" \
      --set-default GRADIO_SERVER_NAME "0.0.0.0"

    # Generic Python wrapper for running any toolkit script
    makeWrapper ${pythonEnv}/bin/python $out/bin/ai-toolkit-python \
      --prefix PATH : ${lib.makeBinPath [ ffmpeg-full git ]} \
      --set-default HF_HUB_ENABLE_HF_TRANSFER "1" \
      --set-default NO_ALBUMENTATIONS_UPDATE "1" \
      --set-default DISABLE_TELEMETRY "YES" \
      --set PYTHONPATH "$out/lib/ai-toolkit"

    runHook postInstall
  '';

  meta = with lib; {
    description = "AI Toolkit - training suite for diffusion models (LoRA, LoKr, full fine-tuning)";
    homepage = "https://github.com/ostris/ai-toolkit";
    license = licenses.asl20;
    platforms = platforms.unix;
    mainProgram = "ai-toolkit-train";
  };
}
