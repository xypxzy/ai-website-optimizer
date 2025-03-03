import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullBoardService } from './bull-board.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'scan-queue',
    }),
  ],
  providers: [BullBoardService],
  exports: [BullBoardService],
})
export class BullBoardModule {}
