import { Module } from '@nestjs/common';
import { ConfigModule } from 'src/config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BrowserPoolService } from './services/browser-pool.service';
import { CrawlerService } from './services/crawler.service';
import { ElementExtractorService } from './services/element-extractor.service';
import { ScreenshotService } from './services/screenshot.service';
import { StorageService } from './services/storage.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    CrawlerService,
    ElementExtractorService,
    ScreenshotService,
    StorageService,
    BrowserPoolService,
  ],
  exports: [CrawlerService, ScreenshotService, BrowserPoolService],
})
export class CrawlerModule {}
