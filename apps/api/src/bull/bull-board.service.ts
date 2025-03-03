import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bull';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bull';

@Injectable()
export class BullBoardService implements OnModuleInit {
  private readonly expressAdapter: ExpressAdapter;
  private scanQueue: Queue | null = null;

  constructor(
    private moduleRef: ModuleRef,
    private configService: ConfigService,
  ) {
    this.expressAdapter = new ExpressAdapter();
    this.expressAdapter.setBasePath('/admin/queues');
  }

  async onModuleInit() {
    try {
      // Try to get the queue dynamically
      this.scanQueue = this.moduleRef.get(getQueueToken('scan-queue'), {
        strict: false,
      });

      // Only set up board if we have a queue
      if (this.scanQueue) {
        createBullBoard({
          queues: [new BullAdapter(this.scanQueue)],
          serverAdapter: this.expressAdapter,
        });
      }
    } catch (error) {
      console.warn('Could not set up Bull Board:', error.message);
    }
  }

  getRouter() {
    return this.expressAdapter.getRouter();
  }
}
