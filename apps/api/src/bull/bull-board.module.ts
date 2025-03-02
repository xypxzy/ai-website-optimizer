import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullBoardService } from './bull-board.service';
import { BullModule } from './bull.module';

@Module({
  imports: [BullModule, ConfigModule],
  providers: [BullBoardService],
  exports: [BullBoardService],
})
export class BullBoardModule {}
