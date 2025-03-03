import { Module } from '@nestjs/common';
import { CrawlerModule } from 'src/crawler/crawler.module';
import { TechnicalAnalysisModule } from 'src/technical-analysis/technical-analysis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PageScansController } from './page-scans.controller';
import { PageScansService } from './page-scans.service';
import { ScanQueueModule } from './scan-queue/scan-queue.module';

@Module({
  imports: [
    PrismaModule,
    CrawlerModule,
    TechnicalAnalysisModule,
    ScanQueueModule,
  ],
  providers: [PageScansService],
  controllers: [PageScansController],
  exports: [PageScansService],
})
export class PageScansModule {}
