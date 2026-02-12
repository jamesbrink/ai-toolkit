# OCI/Docker image for ai-toolkit
# Build with: nix build .#docker
# Load with: docker load < result
# Run UI:    docker run -p 8675:8675 -v ./datasets:/workspace/datasets -v ./output:/workspace/output ai-toolkit
# Run train: docker run ai-toolkit ai-toolkit-train config/your_config.yaml
#
# For mDNS host discovery, use host networking:
#   docker run --network=host ai-toolkit
{
  pkgs,
  lib,
  ai-toolkit,
  ai-toolkit-ui,
}:

pkgs.dockerTools.buildLayeredImage {
  name = "ai-toolkit";
  tag = "latest";

  contents = with pkgs; [
    ai-toolkit
    ai-toolkit-ui
    bashInteractive
    coreutils
    ffmpeg-full
    git
    nodejs_22
    cacert
  ];

  config = {
    Cmd = [ "${ai-toolkit-ui}/bin/ai-toolkit-ui" ];
    WorkingDir = "/workspace";
    Volumes = {
      "/workspace/config" = { };
      "/workspace/output" = { };
      "/workspace/datasets" = { };
      "/workspace/models" = { };
    };
    ExposedPorts = {
      "8675/tcp" = { };
      "5353/udp" = { }; # mDNS
    };
    Env = [
      "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
      "HF_HUB_ENABLE_HF_TRANSFER=1"
      "NO_ALBUMENTATIONS_UPDATE=1"
      "DISABLE_TELEMETRY=YES"
      "PORT=8675"
      "HOSTNAME=0.0.0.0"
      # Data directories (writable workspace)
      "AI_TOOLKIT_UI_DATA=/workspace"
      "DATASETS_FOLDER=/workspace/datasets"
      "TRAINING_FOLDER=/workspace/output"
      "DATA_ROOT=/workspace/data"
      "DATABASE_URL=file:/workspace/aitk_db.db"
    ];
  };
}
