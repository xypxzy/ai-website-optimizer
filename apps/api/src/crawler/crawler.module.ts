import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrawlerService } from './crawler.service';
import { ElementExtractorService } from './element-extractor.service';
import { ScreenshotService } from './screenshot.service';
import { StorageService } from './storage.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CrawlerService,
    ElementExtractorService,
    ScreenshotService,
    StorageService,
  ],
  exports: [CrawlerService, ScreenshotService],
})
export class CrawlerModule {}
