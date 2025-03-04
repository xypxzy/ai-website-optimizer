import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { createHash } from 'crypto';
import { IRecommenderResponse } from '../interfaces/recommender.interface';

@Injectable()
export class RecommenderCacheService {
  private readonly logger = new Logger(RecommenderCacheService.name);
  private readonly TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Generates a cache key for a prompt
   */
  private generateCacheKey(prompt: string): string {
    return createHash('md5').update(prompt).digest('hex');
  }

  /**
   * Gets cached response for a prompt
   */
  async getCachedResponse(
    prompt: string,
  ): Promise<IRecommenderResponse | null> {
    try {
      const cacheKey = this.generateCacheKey(prompt);
      const cachedResponse =
        await this.cacheManager.get<IRecommenderResponse>(cacheKey);

      if (cachedResponse) {
        this.logger.log(`Cache hit for prompt: ${prompt.substring(0, 50)}...`);
        return cachedResponse;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error getting cached response: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Caches a response for a prompt
   */
  async cacheResponse(
    prompt: string,
    response: IRecommenderResponse,
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(prompt);
      await this.cacheManager.set(cacheKey, response, this.TTL);
      this.logger.log(
        `Cached response for prompt: ${prompt.substring(0, 50)}...`,
      );
    } catch (error) {
      this.logger.error(
        `Error caching response: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Clears a cached response for a prompt
   */
  async clearCachedResponse(prompt: string): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(prompt);
      await this.cacheManager.del(cacheKey);
      this.logger.log(
        `Cleared cached response for prompt: ${prompt.substring(0, 50)}...`,
      );
    } catch (error) {
      this.logger.error(
        `Error clearing cached response: ${error.message}`,
        error.stack,
      );
    }
  }
}
