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
  private readonly maxConcurrentJobs = 3;
  private currentJobCount = 0;

  constructor(
    @InjectQueue('scan-queue') private scanQueue: Queue,
    private prisma: PrismaService,
  ) {
    // Мониторинг очереди
    this.setupQueueMonitoring();
  }

  private setupQueueMonitoring() {
    this.scanQueue.on('completed', (job) => {
      this.currentJobCount--;
      this.logger.log(
        `Задача ${job.id} завершена успешно, активных задач: ${this.currentJobCount}`,
      );
    });

    this.scanQueue.on('failed', (job, error) => {
      this.currentJobCount--;
      this.logger.error(
        `Задача ${job.id} завершена с ошибкой: ${error.message}`,
      );
    });

    this.scanQueue.on('active', (job) => {
      this.currentJobCount++;
      this.logger.log(
        `Задача ${job.id} начала выполнение, активных задач: ${this.currentJobCount}`,
      );
    });

    // Периодически проверяем состояние очереди для логирования
    setInterval(async () => {
      try {
        const stats = await this.getQueueStats();
        this.logger.debug(
          `Статистика очереди: ожидающие=${stats.waiting}, активные=${stats.active}, завершенные=${stats.completed}, ошибки=${stats.failed}`,
        );
      } catch (error) {
        this.logger.error(
          `Ошибка получения статистики очереди: ${error.message}`,
        );
      }
    }, 60000); // каждую минуту
  }

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

      // Получаем URL для логирования
      const pageScan = await this.prisma.pageScan.findUnique({
        where: { id: scanId },
        select: { url: true },
      });

      // Добавляем задачу в очередь с указанным приоритетом
      const job = await this.scanQueue.add(
        'scan-page',
        {
          scanId,
          url: pageScan?.url,
          addedAt: new Date().toISOString(),
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          priority, // Меньшее значение = более высокий приоритет
          removeOnComplete: true, // Удаляем завершенные задачи для экономии памяти
          removeOnFail: 100, // Сохраняем только последние 100 неудачных задач
          timeout: 15 * 60 * 1000, // 15 минут максимальное время выполнения
        },
      );

      this.logger.log(
        `Задача сканирования для ${scanId} (${pageScan?.url}) добавлена в очередь с приоритетом ${priority} (id задачи: ${job.id})`,
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

  // Остальной код ScanQueueService без изменений...

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
}
