import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';

@Injectable()
export class BullBoardService implements OnModuleInit {
  private readonly expressAdapter: ExpressAdapter;

  constructor(
    @InjectQueue('scan-queue') private scanQueue: Queue,
    private configService: ConfigService,
  ) {
    this.expressAdapter = new ExpressAdapter();
    this.expressAdapter.setBasePath('/admin/queues');
  }

  onModuleInit() {
    createBullBoard({
      queues: [new BullAdapter(this.scanQueue)],
      serverAdapter: this.expressAdapter,
    });
  }

  getRouter() {
    return this.expressAdapter.getRouter();
  }
}
