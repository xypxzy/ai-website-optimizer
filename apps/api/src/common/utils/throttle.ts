export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Throttle {
  private lastCallTime: number = 0;
  private readonly interval: number;

  constructor(requestsPerSecond: number) {
    this.interval = 1000 / requestsPerSecond;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeToWait = this.lastCallTime + this.interval - now;

    if (timeToWait > 0) {
      await sleep(timeToWait);
    }

    this.lastCallTime = Date.now();
    return fn();
  }
}
