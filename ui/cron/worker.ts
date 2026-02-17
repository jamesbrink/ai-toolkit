import processQueue from './actions/processQueue';
import checkHosts from './actions/checkHosts';
import checkRunPodPods from './actions/checkRunPodPods';
import { startMdns, stopMdns } from './mdns';

const HOST_CHECK_INTERVAL_MS = 30000; // Run checkHosts every 30 seconds
const RUNPOD_CHECK_INTERVAL = 15; // Run checkRunPodPods every 15 iterations (~15s)

class CronWorker {
  interval: number;
  is_running: boolean;
  is_checking_hosts: boolean;
  intervalId: NodeJS.Timeout;
  hostCheckIntervalId: NodeJS.Timeout;
  runpodCheckCounter: number;

  constructor() {
    this.interval = 1000; // Default interval of 1 second
    this.is_running = false;
    this.is_checking_hosts = false;
    this.runpodCheckCounter = 0;

    // Main queue processing loop
    this.intervalId = setInterval(() => {
      this.run();
    }, this.interval);

    // Independent host health check loop
    this.hostCheckIntervalId = setInterval(() => {
      this.runHostCheck();
    }, HOST_CHECK_INTERVAL_MS);

    // Start mDNS discovery (fire-and-forget)
    startMdns().catch(err => {
      console.error('Failed to start mDNS:', err);
    });
  }

  async run() {
    if (this.is_running) {
      return;
    }
    this.is_running = true;
    try {
      await this.loop();
    } catch (error) {
      console.error('Error in cron worker loop:', error);
    }
    this.is_running = false;
  }

  async runHostCheck() {
    if (this.is_checking_hosts) {
      return;
    }
    this.is_checking_hosts = true;
    try {
      await checkHosts();
    } catch (error) {
      console.error('Error in host health check:', error);
    }
    this.is_checking_hosts = false;
  }

  async loop() {
    await processQueue();

    this.runpodCheckCounter++;
    if (this.runpodCheckCounter >= RUNPOD_CHECK_INTERVAL) {
      this.runpodCheckCounter = 0;
      try {
        await checkRunPodPods();
      } catch (error) {
        console.error('Error in RunPod pod check:', error);
      }
    }
  }
}

// it automatically starts the loop
const cronWorker = new CronWorker();
console.log('Cron worker started with interval:', cronWorker.interval, 'ms');

// Graceful shutdown on SIGINT/SIGTERM
function shutdown() {
  console.log('Cron worker shutting down...');
  stopMdns();
  clearInterval(cronWorker.intervalId);
  clearInterval(cronWorker.hostCheckIntervalId);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
