import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PageScansController } from './page-scans.controller';
import { PageScansService } from './page-scans.service';

@Module({
  imports: [PrismaModule],
  providers: [PageScansService],
  controllers: [PageScansController],
  exports: [PageScansService],
})
export class PageScansModule {}
