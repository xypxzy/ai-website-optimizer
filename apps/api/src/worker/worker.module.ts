import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AnalysisModule } from 'src/analysis/analysis.module';
import { CrawlerModule } from 'src/crawler/crawler.module';
import { ScanQueueModule } from 'src/page-scans/scan-queue/scan-queue.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
        defaultJobOptions: {
          attempts: 3,
          removeOnComplete: true,
          removeOnFail: false,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      }),
    }),
    PrismaModule,
    CrawlerModule,
    AnalysisModule,
    ScanQueueModule,
  ],
})
export class WorkerModule {}
