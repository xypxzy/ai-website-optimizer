import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as puppeteer from 'puppeteer';
import { Browser, Page } from 'puppeteer';

interface BrowserInstance {
  browser: Browser;
  isInUse: boolean;
  lastUsed: Date;
  retries: number;
}

@Injectable()
export class BrowserPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private browserPool: BrowserInstance[] = [];
  private readonly maxPoolSize: number;
  private readonly browserTTL: number; // Browser lifetime in ms
  private readonly maxRetries: number;
  private readonly launchDelay: number; // Delay between launch attempts in ms
  private maintenanceInterval: NodeJS.Timeout;
  private initializing = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(private configService: ConfigService) {
    this.maxPoolSize = this.configService.get<number>('BROWSER_POOL_SIZE', 2); // Reduced default from 3 to 2
    this.browserTTL = this.configService.get<number>(
      'BROWSER_TTL',
      1000 * 60 * 15, // Reduced default from 30 minutes to 15
    );
    this.maxRetries = this.configService.get<number>('BROWSER_MAX_RETRIES', 3);
    this.launchDelay = this.configService.get<number>(
      'BROWSER_LAUNCH_DELAY',
      2000,
    );
  }

  async onModuleInit() {
    // Check available system resources before initializing
    this.logSystemResources();

    try {
      // Initialize with a single browser instance
      await this.initBrowser();
    } catch (error) {
      this.logger.warn(
        `Failed to initialize browser on startup: ${error.message}`,
      );
      // Continue regardless of failure - we'll retry later when needed
    }

    // Start pool maintenance
    this.maintenanceInterval = setInterval(
      () => this.performMaintenance(),
      60000,
    );
  }

  async onModuleDestroy() {
    clearInterval(this.maintenanceInterval);
    await this.closeAllBrowsers();
  }

  private logSystemResources(): void {
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const cpuCount = os.cpus().length;
    const loadAvg = os.loadavg()[0].toFixed(2);

    this.logger.log(
      `System resources: ${freeMem}MB/${totalMem}MB free memory, ${cpuCount} CPUs, load: ${loadAvg}`,
    );
  }

  async getBrowser(): Promise<Browser> {
    // First try to find an available browser in the pool
    const availableBrowser = this.browserPool.find(
      (instance) => !instance.isInUse,
    );

    if (availableBrowser) {
      availableBrowser.isInUse = true;
      availableBrowser.lastUsed = new Date();

      // Check if browser is still operational
      try {
        // A simple check to see if the browser is still responsive
        await availableBrowser.browser.pages();
        return availableBrowser.browser;
      } catch (error) {
        // Browser is no longer operational, remove it from pool
        this.logger.warn(
          `Removing defunct browser from pool: ${error.message}`,
        );
        await this.removeBrowserFromPool(availableBrowser);
        // Continue to create a new browser
      }
    }

    // If pool is not full, create a new browser
    if (this.browserPool.length < this.maxPoolSize) {
      try {
        const browser = await this.initBrowser();
        return browser;
      } catch (error) {
        this.logger.error(`Failed to initialize browser: ${error.message}`);
        throw error;
      }
    }

    // If all browsers are in use, wait for one to be released
    this.logger.log('All browsers are in use, waiting for one to be released');
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = 30000; // 30-second timeout

      const checkInterval = setInterval(async () => {
        // Check for timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error('Timed out waiting for available browser'));
          return;
        }

        const browser = this.browserPool.find((instance) => !instance.isInUse);
        if (browser) {
          clearInterval(checkInterval);
          browser.isInUse = true;
          browser.lastUsed = new Date();

          try {
            // Verify browser is still working
            await browser.browser.pages();
            resolve(browser.browser);
          } catch (error) {
            // Remove defunct browser
            await this.removeBrowserFromPool(browser);
            // Try to create a new browser
            try {
              const newBrowser = await this.initBrowser();
              resolve(newBrowser);
            } catch (initError) {
              reject(initError);
            }
          }
        }
      }, 500);
    });
  }

  async releaseBrowser(browser: Browser): Promise<void> {
    const instance = this.browserPool.find((b) => b.browser === browser);
    if (instance) {
      instance.isInUse = false;
      instance.lastUsed = new Date();

      // Verify browser health after use
      try {
        await browser.pages();
      } catch (error) {
        this.logger.warn(
          `Removing unhealthy browser during release: ${error.message}`,
        );
        await this.removeBrowserFromPool(instance);
      }
    }
  }

  private async removeBrowserFromPool(
    instance: BrowserInstance,
  ): Promise<void> {
    // Remove browser from pool
    this.browserPool = this.browserPool.filter((b) => b !== instance);

    try {
      // Close browser if it's still running
      await instance.browser.close();
    } catch (error) {
      // Ignore errors during close, browser may already be closed
      this.logger.debug(`Error closing defunct browser: ${error.message}`);
    }
  }

  private async initBrowser(): Promise<Browser> {
    // If initialization is already in progress, wait for it
    if (this.initializing) {
      await this.initializationPromise;
      const availableBrowser = this.browserPool.find(
        (instance) => !instance.isInUse,
      );
      if (availableBrowser) {
        availableBrowser.isInUse = true;
        availableBrowser.lastUsed = new Date();
        return availableBrowser.browser;
      }
    }

    this.initializing = true;
    this.initializationPromise = this.attemptBrowserLaunch();

    try {
      await this.initializationPromise;
      this.initializing = false;
      return this.browserPool[this.browserPool.length - 1].browser;
    } catch (error) {
      this.initializing = false;
      throw error;
    }
  }

  private async attemptBrowserLaunch(): Promise<void> {
    let browser: Browser | null = null;
    let retryCount = 0;

    while (retryCount < this.maxRetries) {
      try {
        // Log memory before launch
        this.logSystemResources();

        this.logger.log(
          `Initializing browser instance (attempt ${retryCount + 1}/${this.maxRetries})`,
        );

        // Add more memory-related arguments
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--safebrowsing-disable-auto-update',
            // Memory constraints
            '--js-flags=--max-old-space-size=512',
            '--disable-field-trial-config',
            // Reduce resource usage
            '--disable-breakpad',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-notifications',
          ],
          // Add timeout
          timeout: 30000,
          // Additional options
          protocolTimeout: 30000,
          pipe: true, // Use pipe instead of WebSocket
        });

        // Browser was launched successfully
        this.browserPool.push({
          browser,
          isInUse: true,
          lastUsed: new Date(),
          retries: retryCount,
        });

        this.logger.log(
          `Browser initialized after ${retryCount} retries. Pool size: ${this.browserPool.length}`,
        );

        return;
      } catch (error) {
        retryCount++;
        this.logger.warn(
          `Browser launch attempt ${retryCount}/${this.maxRetries} failed: ${error.message}`,
        );

        // Try to close browser if it was partially created
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            // Ignore errors during close
          }
        }

        // If we have more retries, delay before next attempt
        if (retryCount < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, this.launchDelay));
        } else {
          this.logger.error(
            `Browser initialization failed after ${this.maxRetries} attempts`,
          );
          throw error;
        }
      }
    }
  }

  private async performMaintenance(): Promise<void> {
    try {
      // Log current pool status
      this.logger.debug(
        `Browser pool status: ${this.browserPool.length} total, ${
          this.browserPool.filter((instance) => instance.isInUse).length
        } in use`,
      );

      // Log system resources
      this.logSystemResources();

      const now = new Date();
      const idleBrowsers = this.browserPool.filter(
        (instance) =>
          !instance.isInUse &&
          now.getTime() - instance.lastUsed.getTime() > this.browserTTL,
      );

      // Close idle browsers that exceeded TTL
      for (const instance of idleBrowsers) {
        try {
          await instance.browser.close();
          this.logger.log('Closed idle browser instance during maintenance');
        } catch (error) {
          this.logger.warn(
            `Error closing browser during maintenance: ${error.message}`,
          );
        }
      }

      // Remove closed browsers from pool
      this.browserPool = this.browserPool.filter(
        (instance) => !idleBrowsers.includes(instance),
      );

      // Health check for remaining browsers and repair if needed
      for (const instance of [...this.browserPool]) {
        if (!instance.isInUse) {
          try {
            // Simple health check
            await instance.browser.pages();
          } catch (error) {
            this.logger.warn(
              `Removing unhealthy browser during maintenance: ${error.message}`,
            );
            await this.removeBrowserFromPool(instance);
          }
        }
      }

      // Try to maintain at least one idle browser if pool is not at capacity
      if (
        this.browserPool.length < this.maxPoolSize &&
        !this.browserPool.some((browser) => !browser.isInUse)
      ) {
        try {
          await this.initBrowser();
          const newBrowser = this.browserPool[this.browserPool.length - 1];
          newBrowser.isInUse = false; // Mark as available
        } catch (error) {
          this.logger.warn(
            `Failed to create idle browser during maintenance: ${error.message}`,
          );
        }
      }

      this.logger.debug(
        `Browser pool maintenance complete. Pool size: ${this.browserPool.length}`,
      );
    } catch (error) {
      this.logger.error(
        `Error during browser pool maintenance: ${error.message}`,
        error.stack,
      );
    }
  }

  private async closeAllBrowsers(): Promise<void> {
    this.logger.log(`Closing all browsers (${this.browserPool.length} total)`);

    for (const instance of this.browserPool) {
      try {
        await instance.browser.close();
      } catch (error) {
        this.logger.warn(`Error closing browser: ${error.message}`);
      }
    }
    this.browserPool = [];
    this.logger.log('All browsers closed');
  }

  // Helper for creating a new page with settings
  async getConfiguredPage(): Promise<Page> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Standard page settings
      await page.setViewport({ width: 1280, height: 800 }); // Reduced from 1920x1080
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.67 Safari/537.36',
      );

      // Set timeout handlers
      page.setDefaultNavigationTimeout(30000);
      page.setDefaultTimeout(30000);

      // Block unnecessary resources to improve speed and reduce memory
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        // Block more resource types to save memory
        if (
          ['font', 'media', 'image', 'stylesheet'].includes(resourceType) ||
          // Block tracking and analytics
          request.url().includes('google-analytics') ||
          request.url().includes('facebook') ||
          request.url().includes('analytics') ||
          request.url().includes('tracker')
        ) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Add error handler to page to catch page crashes
      page.on('error', (error) => {
        this.logger.error(`Page crashed: ${error.message}`);
        // Attempt to close page to prevent memory leaks
        try {
          page.close().catch(() => {});
        } catch (e) {
          // Ignore errors during close
        }
      });

      return page;
    } catch (error) {
      // If page configuration fails, ensure we close the page to prevent leaks
      try {
        await page.close();
      } catch (closeError) {
        // Ignore errors during close
      }
      throw error;
    }
  }

  // Helper to clean up after page use
  async closePage(page: Page): Promise<void> {
    try {
      if (page) {
        // Clear listeners to prevent memory leaks
        page.removeAllListeners();
        // Close page
        await page.close();
      }
    } catch (error) {
      this.logger.warn(`Error closing page: ${error.message}`);
    }
  }
}
