import fs from 'fs';
import path from 'path';

/**
 * Kill the OS process for a training job using its pid.txt file.
 * Sends SIGTERM first, then SIGKILL after a short delay if still alive.
 * Returns true if a process was found and killed.
 */
export function killJobProcess(trainingFolder: string): boolean {
  const pidFile = path.join(trainingFolder, 'pid.txt');
  if (!fs.existsSync(pidFile)) {
    return false;
  }

  const pidStr = fs.readFileSync(pidFile, 'utf-8').trim();
  const pid = parseInt(pidStr, 10);
  if (isNaN(pid) || pid <= 0) {
    return false;
  }

  try {
    // Check if process is alive (signal 0 doesn't kill, just checks)
    process.kill(pid, 0);
  } catch {
    // Process already dead
    return false;
  }

  try {
    // Send SIGTERM for graceful shutdown
    process.kill(pid, 'SIGTERM');

    // Give it a moment, then force kill if still alive
    setTimeout(() => {
      try {
        process.kill(pid, 0); // still alive?
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already exited, nothing to do
      }
    }, 3000);

    return true;
  } catch {
    return false;
  }
}
