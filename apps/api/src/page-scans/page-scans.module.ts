import { Module } from '@nestjs/common';
import { CrawlerModule } from 'src/crawler/crawler.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PageScansController } from './page-scans.controller';
import { PageScansService } from './page-scans.service';

@Module({
  imports: [PrismaModule, CrawlerModule],
  providers: [PageScansService],
  controllers: [PageScansController],
  exports: [PageScansService],
})
export class PageScansModule {}
