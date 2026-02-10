import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import si from 'systeminformation';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Get platform
    const platform = os.platform();
    const isWindows = platform === 'win32';

    // Check if nvidia-smi is available
    const hasNvidiaSmi = await checkNvidiaSmi(isWindows);

    if (hasNvidiaSmi) {
      // Get GPU stats
      const gpuStats = await getGpuStats(isWindows);

      return NextResponse.json({
        hasNvidiaSmi: true,
        deviceType: 'nvidia',
        gpus: gpuStats,
      });
    }

    // No NVIDIA GPU — check for Apple Silicon MPS
    if (platform === 'darwin' && os.arch() === 'arm64') {
      const mpsResult = await detectMps();
      if (mpsResult) {
        return NextResponse.json(mpsResult);
      }
    }

    return NextResponse.json({
      hasNvidiaSmi: false,
      deviceType: 'none',
      gpus: [],
      error: 'No supported GPU detected',
    });
  } catch (error) {
    console.error('Error fetching GPU stats:', error);
    return NextResponse.json(
      {
        hasNvidiaSmi: false,
        deviceType: 'none',
        gpus: [],
        error: `Failed to fetch GPU stats: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 },
    );
  }
}

async function checkNvidiaSmi(isWindows: boolean): Promise<boolean> {
  try {
    if (isWindows) {
      // Check if nvidia-smi is available on Windows
      // It's typically located in C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe
      // but we'll just try to run it directly as it may be in PATH
      await execAsync('nvidia-smi -L');
    } else {
      // Linux/macOS check
      await execAsync('which nvidia-smi');
    }
    return true;
  } catch (error) {
    return false;
  }
}

async function detectMps() {
  try {
    const graphics = await si.graphics();
    const mem = await si.mem();
    const appleGpu = graphics.controllers.find(
      c => c.vendor?.toLowerCase().includes('apple') || c.model?.toLowerCase().includes('apple'),
    );
    if (appleGpu) {
      const totalMB = Math.round(mem.total / (1024 * 1024));
      const usedMB = Math.round((mem.total - mem.available) / (1024 * 1024));
      return {
        hasNvidiaSmi: false,
        deviceType: 'mps',
        gpus: [
          {
            index: 0,
            name: appleGpu.model || 'Apple Silicon GPU',
            utilization: { gpu: 0, memory: Math.round((usedMB / totalMB) * 100) },
            memory: { total: totalMB, free: totalMB - usedMB, used: usedMB },
            isMps: true,
          },
        ],
      };
    }
  } catch (error) {
    console.error('Error detecting MPS GPU:', error);
  }
  return null;
}

async function getGpuStats(isWindows: boolean) {
  // Command is the same for both platforms, but the path might be different
  const command =
    'nvidia-smi --query-gpu=index,name,driver_version,temperature.gpu,utilization.gpu,utilization.memory,memory.total,memory.free,memory.used,power.draw,power.limit,clocks.current.graphics,clocks.current.memory,fan.speed --format=csv,noheader,nounits';

  // Execute command
  const { stdout } = await execAsync(command, {
    env: { ...process.env, CUDA_DEVICE_ORDER: 'PCI_BUS_ID' },
  });

  // Parse CSV output
  const gpus = stdout
    .trim()
    .split('\n')
    .map(line => {
      const [
        index,
        name,
        driverVersion,
        temperature,
        gpuUtil,
        memoryUtil,
        memoryTotal,
        memoryFree,
        memoryUsed,
        powerDraw,
        powerLimit,
        clockGraphics,
        clockMemory,
        fanSpeed,
      ] = line.split(', ').map(item => item.trim());

      return {
        index: parseInt(index),
        name,
        driverVersion,
        temperature: parseInt(temperature),
        utilization: {
          gpu: parseInt(gpuUtil),
          memory: parseInt(memoryUtil),
        },
        memory: {
          total: parseInt(memoryTotal),
          free: parseInt(memoryFree),
          used: parseInt(memoryUsed),
        },
        power: {
          draw: parseFloat(powerDraw),
          limit: parseFloat(powerLimit),
        },
        clocks: {
          graphics: parseInt(clockGraphics),
          memory: parseInt(clockMemory),
        },
        fan: {
          speed: parseInt(fanSpeed) || 0, // Some GPUs might not report fan speed, default to 0
        },
      };
    });

  return gpus;
}
