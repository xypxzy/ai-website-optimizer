import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

@Injectable()
export class ScanQueueService {
  private readonly logger = new Logger(ScanQueueService.name);

  constructor(
    @InjectQueue('scan-queue') private scanQueue: Queue,
    private prisma: PrismaService,
  ) {}

  /**
   * Добавляет задачу сканирования в очередь
   * @param scanId ID сканирования
   */
  async addScanJob(scanId: string, priority: number = 0): Promise<void> {
    try {
      // Обновляем статус сканирования на "queued"
      await this.prisma.pageScan.update({
        where: { id: scanId },
        data: { status: 'queued' },
      });

      // Добавляем задачу в очередь с указанным приоритетом
      await this.scanQueue.add(
        'scan-page',
        {
          scanId,
          addedAt: new Date().toISOString(),
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          priority, // Меньшее значение = более высокий приоритет
        },
      );

      this.logger.log(
        `Задача сканирования для ${scanId} добавлена в очередь с приоритетом ${priority}`,
      );
    } catch (error) {
      this.logger.error(`Ошибка добавления задачи в очередь: ${error.message}`);

      // В случае ошибки обновляем статус на "failed"
      await this.prisma.pageScan.update({
        where: { id: scanId },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Отменяет задачу сканирования
   * @param scanId ID сканирования
   */
  async cancelScanJob(scanId: string): Promise<boolean> {
    try {
      const jobs = await this.scanQueue.getJobs([
        'waiting',
        'delayed',
        'active',
      ]);

      for (const job of jobs) {
        if (job.data.scanId === scanId) {
          await job.remove();

          // Обновляем статус сканирования на "cancelled"
          await this.prisma.pageScan.update({
            where: { id: scanId },
            data: {
              status: 'cancelled',
              completedAt: new Date(),
            },
          });

          this.logger.log(`Задача сканирования для ${scanId} отменена`);
          return true;
        }
      }

      this.logger.warn(
        `Задача сканирования для ${scanId} не найдена в очереди`,
      );
      return false;
    } catch (error) {
      this.logger.error(`Ошибка отмены задачи: ${error.message}`);
      throw error;
    }
  }

  /**
   * Возвращает информацию о задаче сканирования
   * @param scanId ID сканирования
   */
  async getScanJobStatus(scanId: string): Promise<{
    isInQueue: boolean;
    status: string;
    attempts?: number;
    progress?: number;
    processedOn?: Date;
    finishedOn?: Date;
    failedReason?: string;
    lastProgressMessage?: string;
    lastProgressTime?: string;
  }> {
    try {
      const jobs = await this.scanQueue.getJobs([
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
      ]);

      for (const job of jobs) {
        if (job.data.scanId === scanId) {
          const state = await job.getState();
          const progress = job.progress();

          return {
            isInQueue: true,
            status: state,
            attempts: job.attemptsMade,
            progress: typeof progress === 'number' ? progress : 0,
            processedOn: job.processedOn
              ? new Date(job.processedOn)
              : undefined,
            finishedOn: job.finishedOn ? new Date(job.finishedOn) : undefined,
            failedReason: job.failedReason,
            lastProgressMessage: job.data.lastProgressMessage,
            lastProgressTime: job.data.lastProgressTime,
          };
        }
      }

      return { isInQueue: false, status: 'not_found' };
    } catch (error) {
      this.logger.error(`Ошибка получения статуса задачи: ${error.message}`);
      throw error;
    }
  }

  /**
   * Возвращает статистику очереди
   */
  async getQueueStats(): Promise<QueueStats> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.scanQueue.getWaitingCount(),
        this.scanQueue.getActiveCount(),
        this.scanQueue.getCompletedCount(),
        this.scanQueue.getFailedCount(),
        this.scanQueue.getDelayedCount(),
      ]);

      const isPaused = await this.scanQueue.isPaused();

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused: isPaused,
      };
    } catch (error) {
      this.logger.error(
        `Ошибка получения статистики очереди: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Очищает очередь
   */
  async clearQueue(
    status:
      | 'waiting'
      | 'active'
      | 'completed'
      | 'failed'
      | 'delayed'
      | 'all' = 'all',
  ): Promise<void> {
    try {
      if (status === 'all') {
        await this.scanQueue.empty();
      } else {
        const jobs = await this.scanQueue.getJobs([status]);
        for (const job of jobs) {
          await job.remove();
        }
      }

      this.logger.log(`Очередь очищена (статус: ${status})`);
    } catch (error) {
      this.logger.error(`Ошибка очистки очереди: ${error.message}`);
      throw error;
    }
  }

  /**
   * Приостанавливает очередь
   */
  async pauseQueue(): Promise<void> {
    try {
      await this.scanQueue.pause();
      this.logger.log('Очередь приостановлена');
    } catch (error) {
      this.logger.error(`Ошибка приостановки очереди: ${error.message}`);
      throw error;
    }
  }

  /**
   * Возобновляет очередь
   */
  async resumeQueue(): Promise<void> {
    try {
      await this.scanQueue.resume();
      this.logger.log('Очередь возобновлена');
    } catch (error) {
      this.logger.error(`Ошибка возобновления очереди: ${error.message}`);
      throw error;
    }
  }
}
