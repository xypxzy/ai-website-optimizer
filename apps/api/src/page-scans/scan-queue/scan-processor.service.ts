import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { AnalysisService } from 'src/analysis/analysis.service';
import { CrawlerService } from 'src/crawler/services/crawler.service';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('scan-queue')
export class ScanProcessor {
  private readonly logger = new Logger(ScanProcessor.name);
  private readonly maxRetries = 3;

  constructor(
    private crawlerService: CrawlerService,
    private analysisService: AnalysisService,
    private prisma: PrismaService,
  ) {}

  @Process({
    name: 'scan-page',
    concurrency: 3, // Параллельная обработка до 3 задач
  })
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

      // Запускаем сканирование с ограничением времени выполнения
      const scanTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => {
            reject(new Error('Таймаут сканирования превышен (5 минут)'));
          },
          5 * 60 * 1000,
        ); // 5 минут
      });

      // Запускаем сканирование
      await Promise.race([
        this.crawlerService.scanPage(job.data.scanId, job),
        scanTimeoutPromise,
      ]);

      // Запускаем технический анализ с отдельным таймаутом
      const analysisTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => {
            reject(new Error('Таймаут анализа превышен (10 минут)'));
          },
          10 * 60 * 1000,
        ); // 10 минут
      });

      await Promise.race([
        this.analysisService.runTechnicalAnalysisForScan(job.data.scanId),
        analysisTimeoutPromise,
      ]);

      // Завершаем с прогрессом 100%
      await job.progress(100);

      this.logger.log(`Задача сканирования ${job.id} успешно завершена`);
    } catch (error) {
      this.logger.error(
        `Ошибка при обработке задачи сканирования ${job.id}: ${error.message}`,
        error.stack,
      );

      // Если это последняя попытка, обновляем статус на "failed"
      if (job.attemptsMade >= this.maxRetries) {
        await this.prisma.pageScan.update({
          where: { id: job.data.scanId },
          data: {
            status: 'failed',
            completedAt: new Date(),
          },
        });
        this.logger.warn(
          `Задача ${job.id} провалена после ${job.attemptsMade} попыток`,
        );
      } else {
        this.logger.log(
          `Будет выполнена повторная попытка для задачи ${job.id}, текущее количество попыток: ${job.attemptsMade}`,
        );
      }

      throw error; // Повторная попытка будет выполнена автоматически (при наличии попыток)
    }
  }
}
