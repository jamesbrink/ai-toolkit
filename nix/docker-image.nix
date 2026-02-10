# OCI/Docker image for ai-toolkit
# Build with: nix build .#docker
# Load with: docker load < result
{ pkgs
, lib
, ai-toolkit
}:

pkgs.dockerTools.buildLayeredImage {
  name = "ai-toolkit";
  tag = "latest";

  contents = with pkgs; [
    ai-toolkit
    bashInteractive
    coreutils
    ffmpeg-full
    git
    cacert
  ];

  config = {
    Cmd = [ "${ai-toolkit}/bin/ai-toolkit-train" ];
    WorkingDir = "/workspace";
    Volumes = {
      "/workspace/config" = { };
      "/workspace/output" = { };
      "/workspace/datasets" = { };
      "/workspace/models" = { };
    };
    Env = [
      "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
      "HF_HUB_ENABLE_HF_TRANSFER=1"
      "NO_ALBUMENTATIONS_UPDATE=1"
      "DISABLE_TELEMETRY=YES"
    ];
  };
}
