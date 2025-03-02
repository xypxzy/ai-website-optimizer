import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { CrawlerModule } from '../../crawler/crawler.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScanProcessor } from './scan-processor.service';
import { ScanQueueController } from './scan-queue.controller';
import { ScanQueueService } from './scan-queue.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'scan-queue',
    }),
    CrawlerModule,
    PrismaModule,
  ],
  controllers: [ScanQueueController],
  providers: [ScanQueueService, ScanProcessor],
  exports: [ScanQueueService],
})
export class ScanQueueModule {}
