import { CpuInfo } from '@/types';
import { HardDrive, Cpu } from 'lucide-react';

interface CPUWidgetProps {
  cpu: CpuInfo | null;
}

export default function CPUWidget({ cpu }: CPUWidgetProps) {
  const formatMemory = (mb: number): string => {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  };

  const getUtilizationColor = (value: number): string => {
    return value < 30 ? 'bg-emerald-500' : value < 70 ? 'bg-amber-500' : 'bg-rose-500';
  };

  if (!cpu) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-zinc-200 dark:border-zinc-800">
        <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="font-semibold text-zinc-900 dark:text-gray-100">CPU Info</h2>
          </div>
        </div>
        <div className="p-4">
          <p className="text-sm text-zinc-500 dark:text-gray-400">No CPU data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-zinc-200 dark:border-zinc-800">
      <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h2 className="font-semibold text-zinc-900 dark:text-gray-100">{cpu.name}</h2>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Temperature, Fan, and Utilization Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="">
            <div className="flex items-center space-x-2 mb-1 mt-1">
              <Cpu className="w-4 h-4 text-zinc-400 dark:text-gray-400" />
              <p className="text-xs text-zinc-500 dark:text-gray-400">CPU Load</p>
              <span className="text-xs text-zinc-600 dark:text-gray-300 ml-auto">{cpu.currentLoad.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-gray-700 rounded-full h-1">
              <div
                className={`h-1 rounded-full transition-all ${getUtilizationColor(cpu.currentLoad)}`}
                style={{ width: `${cpu.currentLoad}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2 mb-1 mt-1">
              <HardDrive className="w-4 h-4 text-blue-400" />
              <p className="text-xs text-zinc-500 dark:text-gray-400">Memory</p>
              <span className="text-xs text-zinc-600 dark:text-gray-300 ml-auto">
                {(((cpu.totalMemory - cpu.availableMemory) / cpu.totalMemory) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-gray-700 rounded-full h-1">
              <div
                className="h-1 rounded-full bg-blue-500 transition-all"
                style={{ width: `${((cpu.totalMemory - cpu.availableMemory) / cpu.totalMemory) * 100}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 dark:text-gray-400 mt-0.5">
              {formatMemory(cpu.totalMemory - cpu.availableMemory)} / {formatMemory(cpu.totalMemory)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
