import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('Worker');
  logger.log('Starting worker process...');

  const app = await NestFactory.create(WorkerModule);
  await app.init();

  logger.log('Worker initialized and connected to queues');
}

bootstrap();
