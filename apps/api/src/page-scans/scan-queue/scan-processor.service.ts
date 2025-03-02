import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { CrawlerService } from '../../crawler/crawler.service';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('scan-queue')
export class ScanProcessor {
  private readonly logger = new Logger(ScanProcessor.name);

  constructor(
    private crawlerService: CrawlerService,
    private prisma: PrismaService,
  ) {}

  @Process('scan-page')
  async handleScanJob(job: Job<{ scanId: string }>): Promise<void> {
    this.logger.log(
      `Начало обработки задачи сканирования ${job.id} для scanId: ${job.data.scanId}`,
    );

    try {
      // Обновляем статус сканирования на "in_progress"
      await this.prisma.pageScan.update({
        where: { id: job.data.scanId },
        data: { status: 'in_progress' },
      });

      // Устанавливаем начальный прогресс
      await job.progress(10);

      // Запускаем сканирование
      await this.crawlerService.scanPage(job.data.scanId);

      // Завершаем с прогрессом 100%
      await job.progress(100);

      this.logger.log(`Задача сканирования ${job.id} успешно завершена`);
    } catch (error) {
      this.logger.error(
        `Ошибка при обработке задачи сканирования ${job.id}: ${error.message}`,
        error.stack,
      );

      // Если это последняя попытка, обновляем статус на "failed"
      if (job.attemptsMade >= (job.opts.attempts ?? 0)) {
        await this.prisma.pageScan.update({
          where: { id: job.data.scanId },
          data: {
            status: 'failed',
            completedAt: new Date(),
          },
        });
      }

      throw error; // Повторная попытка будет выполнена автоматически (при наличии попыток)
    }
  }
}
