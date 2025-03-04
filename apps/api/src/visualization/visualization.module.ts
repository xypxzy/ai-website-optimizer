import { Module } from '@nestjs/common';
import { CrawlerModule } from '../crawler/crawler.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PreviewStorageService } from './services/preview-storage.service';
import { RenderService } from './services/render.service';
import { VisualizationController } from './visualization.controller';
import { VisualizationService } from './visualization.service';

@Module({
  imports: [PrismaModule, CrawlerModule],
  controllers: [VisualizationController],
  providers: [VisualizationService, RenderService, PreviewStorageService],
  exports: [VisualizationService],
})
export class VisualizationModule {}
