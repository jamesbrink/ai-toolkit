# OCI/Docker image for ai-toolkit
# Build with: nix build .#docker
# Load with: ./result | docker load  (or: ./result | podman load)
# Run UI:    docker run -p 8675:8675 -p 22:22 -v ./datasets:/workspace/datasets -v ./output:/workspace/output ai-toolkit
# Run train: docker run ai-toolkit ai-toolkit-train config/your_config.yaml
#
# For mDNS host discovery, use host networking:
#   docker run --network=host ai-toolkit
#
# For RunPod SSH access, set PUBLIC_KEY env var:
#   docker run -e PUBLIC_KEY="ssh-ed25519 ..." ai-toolkit
{
  pkgs,
  lib,
  ai-toolkit,
  ai-toolkit-ui,
}:

let
  entrypoint = pkgs.runCommand "docker-entrypoint" { } ''
    cp ${
      pkgs.replaceVars ./docker-entrypoint.sh {
        openssh = pkgs.openssh;
        uiWrapper = ai-toolkit-ui;
      }
    } $out
    chmod +x $out
  '';

  # Symlink the Nix glibc dynamic linker to the standard FHS path so that
  # non-Nix binaries injected by the NVIDIA container runtime (nvidia-smi,
  # nvidia-debugdump, etc.) can find their ELF interpreter.
  glibcLdLinux = pkgs.runCommand "glibc-ld-linux-symlink" { } ''
    mkdir -p $out/lib64
    ln -s ${pkgs.glibc}/lib/ld-linux-x86-64.so.2 $out/lib64/ld-linux-x86-64.so.2
  '';
in

pkgs.dockerTools.streamLayeredImage {
  name = "ai-toolkit";
  tag = "latest";

  contents = pkgs.buildEnv {
    name = "ai-toolkit-env";
    paths = with pkgs; [
      ai-toolkit
      ai-toolkit-ui
      bashInteractive
      coreutils
      ffmpeg-full
      git
      nodejs_22
      cacert
      openssh
      gnugrep
      gawk
      glibcLdLinux
    ];
    pathsToLink = [
      "/bin"
      "/lib"
      "/lib64"
      "/share"
    ];
  };

  extraCommands = ''
    # /usr/bin/env is required by scripts using #!/usr/bin/env bash shebangs
    mkdir -p usr/bin
    ln -s /bin/env usr/bin/env

    # sshd requires these directories and files
    mkdir -p run/sshd
    mkdir -p etc/ssh
    mkdir -p root/.ssh
    mkdir -p var/empty
    mkdir -p var/log
    chmod 700 root/.ssh
    mkdir -p tmp
    chmod 1777 tmp

    # Minimal passwd/group/shadow for sshd
    echo 'root:x:0:0:root:/root:/bin/bash' > etc/passwd
    echo 'root:x:0:' > etc/group
    echo 'root:!:1::::::' > etc/shadow
    chmod 640 etc/shadow
    echo 'sshd:x:74:74:sshd:/var/empty/sshd:/bin/false' >> etc/passwd
    echo 'sshd:x:74:' >> etc/group

    # Minimal sshd_config
    cat > etc/ssh/sshd_config << 'SSHD_EOF'
    Port 22
    PermitRootLogin yes
    PubkeyAuthentication yes
    PasswordAuthentication no
    ChallengeResponseAuthentication no
    UsePAM no
    Subsystem sftp internal-sftp
    SSHD_EOF
  '';

  config = {
    Entrypoint = [ "${entrypoint}" ];
    WorkingDir = "/workspace";
    Volumes = {
      "/workspace/config" = { };
      "/workspace/output" = { };
      "/workspace/datasets" = { };
      "/workspace/models" = { };
    };
    ExposedPorts = {
      "8675/tcp" = { };
      "22/tcp" = { };
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
      # CUDA compute capabilities for RunPod GPU coverage (Ampere→Blackwell)
      "TORCH_CUDA_ARCH_LIST=8.0;8.6;8.9;9.0;10.0;12.0"
      # NVIDIA container runtime: inject driver userspace libraries (libcuda.so, nvidia-smi, etc.)
      "NVIDIA_VISIBLE_DEVICES=all"
      "NVIDIA_DRIVER_CAPABILITIES=compute,utility"
      # Driver libs are injected into standard paths; Nix's linker doesn't search them by default
      "LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/usr/lib64:/usr/local/nvidia/lib64"
    ];
  };
}
