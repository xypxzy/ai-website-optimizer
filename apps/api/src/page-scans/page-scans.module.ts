import { Module } from '@nestjs/common';
import { AnalysisModule } from 'src/analysis/analysis.module';
import { CrawlerModule } from 'src/crawler/crawler.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PageScansController } from './page-scans.controller';
import { PageScansService } from './page-scans.service';
import { ScanQueueModule } from './scan-queue/scan-queue.module';

@Module({
  imports: [PrismaModule, ScanQueueModule, CrawlerModule, AnalysisModule],
  providers: [PageScansService],
  controllers: [PageScansController],
  exports: [PageScansService],
})
export class PageScansModule {}
