import processQueue from './actions/processQueue';
import checkHosts from './actions/checkHosts';
import { startMdns, stopMdns } from './mdns';

const HOST_CHECK_INTERVAL = 30; // Run checkHosts every 30 iterations (~30s)

class CronWorker {
  interval: number;
  is_running: boolean;
  intervalId: NodeJS.Timeout;
  hostCheckCounter: number;

  constructor() {
    this.interval = 1000; // Default interval of 1 second
    this.is_running = false;
    this.hostCheckCounter = 0;
    this.intervalId = setInterval(() => {
      this.run();
    }, this.interval);

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
      // Loop logic here
      await this.loop();
    } catch (error) {
      console.error('Error in cron worker loop:', error);
    }
    this.is_running = false;
  }

  async loop() {
    await processQueue();

    this.hostCheckCounter++;
    if (this.hostCheckCounter >= HOST_CHECK_INTERVAL) {
      this.hostCheckCounter = 0;
      try {
        await checkHosts();
      } catch (error) {
        console.error('Error in host health check:', error);
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
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
