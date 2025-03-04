import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RecommenderController } from './recommender.controller';
import { RecommenderService } from './recommender.service';
import { OpenAIService } from './services/openai.service';
import { RecommendationProcessorService } from './services/recommendation-processor.service';
import { RecommendationStorageService } from './services/recommendation-storage.service';
import { RecommenderCacheService } from './services/recommender-cache.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    CacheModule.register({
      ttl: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      max: 100, // Maximum number of items in cache
    }),
  ],
  controllers: [RecommenderController],
  providers: [
    OpenAIService,
    RecommendationProcessorService,
    RecommendationStorageService,
    RecommenderCacheService,
    RecommenderService,
  ],
  exports: [RecommenderService],
})
export class RecommenderModule {}
