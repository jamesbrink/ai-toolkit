#!/usr/bin/env bash
set -euo pipefail

# Docker entrypoint for RunPod and similar GPU cloud platforms.
# Handles SSH setup, environment export, then hands off to the Nix UI wrapper.
#
# Nix store path placeholders (substituted at build time):
#   @openssh@   - openssh package
#   @uiWrapper@ - ai-toolkit-ui wrapper package

# ---------------------------------------------------------------------------- #
#                          Function Definitions                                #
# ---------------------------------------------------------------------------- #

setup_ssh() {
  if [[ -z "${PUBLIC_KEY:-}" ]]; then
    return
  fi

  echo "Setting up SSH..."
  mkdir -p /root/.ssh
  echo "$PUBLIC_KEY" >> /root/.ssh/authorized_keys
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/authorized_keys

  # Generate host keys if they don't exist
  for keytype in rsa ecdsa ed25519; do
    if [[ ! -f "/etc/ssh/ssh_host_${keytype}_key" ]]; then
      @openssh@/bin/ssh-keygen -t "$keytype" -f "/etc/ssh/ssh_host_${keytype}_key" -q -N ''
      echo "${keytype^^} key fingerprint:"
      @openssh@/bin/ssh-keygen -lf "/etc/ssh/ssh_host_${keytype}_key.pub"
    fi
  done

  # Start sshd (Nix has no `service` command; run the daemon directly)
  @openssh@/sbin/sshd

  echo "SSH host keys:"
  for key in /etc/ssh/ssh_host_*.pub; do
    [[ -f "$key" ]] || continue
    echo "Key: $key"
    @openssh@/bin/ssh-keygen -lf "$key"
  done
}

export_env_vars() {
  echo "Exporting environment variables..."
  printenv | grep -E '^RUNPOD_|^AI_TOOLKIT_|^HF_|^ANTHROPIC_|^CLAUDE_|^PATH=' \
    | awk -F = '{ print "export " $1 "=\"" $2 "\"" }' > /etc/rp_environment
  echo 'source /etc/rp_environment' >> /root/.bashrc
}

# Detect NVIDIA driver libraries injected by the container runtime and ensure
# they are on LD_LIBRARY_PATH so the Nix-built PyTorch can find libcuda.so.
setup_nvidia_libs() {
  local nvidia_dirs=""
  for dir in /usr/lib/x86_64-linux-gnu /usr/lib64 /usr/local/nvidia/lib64; do
    if [[ -f "${dir}/libcuda.so" ]]; then
      nvidia_dirs="${nvidia_dirs:+${nvidia_dirs}:}${dir}"
    fi
  done
  if [[ -n "$nvidia_dirs" ]]; then
    export LD_LIBRARY_PATH="${nvidia_dirs}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
    echo "NVIDIA driver libraries found: ${nvidia_dirs}"
  else
    echo "Warning: libcuda.so not found — GPU acceleration may not be available"
  fi
}

# ---------------------------------------------------------------------------- #
#                               Main Program                                   #
# ---------------------------------------------------------------------------- #

echo "Pod Started"

setup_nvidia_libs
setup_ssh
export_env_vars

exec @uiWrapper@/bin/ai-toolkit-ui
