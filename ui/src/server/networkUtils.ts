import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Detect the device type (nvidia/mps/cpu) of this machine.
 * Extracted from identify route for reuse across registration and health endpoints.
 */
export async function detectDeviceType(): Promise<string> {
  // Check for NVIDIA GPU — use 'command -v' (POSIX builtin, works without 'which' package)
  // then fall back to checking known NVIDIA binary paths directly
  try {
    await execAsync(
      os.platform() === 'win32'
        ? 'nvidia-smi -L'
        : 'command -v nvidia-smi || ' +
            'test -x /usr/bin/nvidia-smi || ' +
            'test -x /usr/local/nvidia/bin/nvidia-smi || ' +
            'test -x /usr/local/cuda/bin/nvidia-smi',
    );
    return 'nvidia';
  } catch {
    // No NVIDIA GPU
  }

  // Check for Apple Silicon MPS
  if (os.platform() === 'darwin' && os.arch() === 'arm64') {
    return 'mps';
  }

  return 'cpu';
}

/**
 * Get the primary non-loopback IPv4 address of this machine.
 * Returns '127.0.0.1' if no suitable address is found.
 */
export function getPrimaryLocalAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const info of iface) {
      if (!info.internal && info.family === 'IPv4') {
        return info.address;
      }
    }
  }
  return '127.0.0.1';
}
