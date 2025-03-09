import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { Page } from 'puppeteer';
import { sleep, Throttle } from 'src/common/utils/throttle';
import { PrismaService } from 'src/prisma/prisma.service';
import { BrowserPoolService } from './browser-pool.service';
import { ElementExtractorService } from './element-extractor.service';
import { ScreenshotService } from './screenshot.service';
import { StorageService } from './storage.service';

export interface ProgressUpdater {
  (progress: number, message?: string): Promise<void>;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly throttle = new Throttle(5); // Максимум 5 запросов в секунду

  constructor(
    private prisma: PrismaService,
    private elementExtractor: ElementExtractorService,
    private screenshotService: ScreenshotService,
    private storageService: StorageService,
    private browserPoolService: BrowserPoolService,
  ) {}

  async scanPage(scanId: string, job?: Job): Promise<void> {
    const updateProgress = this.createProgressUpdater(job);
    let page: Page | null = null;

    try {
      await updateProgress(5, 'Начало сканирования');

      const pageScan = await this.prisma.pageScan.findUnique({
        where: { id: scanId },
      });

      if (!pageScan) {
        throw new Error(`PageScan с ID ${scanId} не найден`);
      }

      await this.prisma.pageScan.update({
        where: { id: scanId },
        data: { status: 'in_progress' },
      });

      await updateProgress(10, 'Инициализация браузера');

      // Получаем настроенную страницу из пула браузеров
      page = await this.browserPoolService.getConfiguredPage();

      this.logger.log(`Переход на ${pageScan.url}`);
      await updateProgress(15, `Загрузка страницы: ${pageScan.url}`);

      // Применяем троттлинг для предотвращения блокировки
      await this.throttle.execute(async () => {
        await page?.goto(pageScan.url, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });
      });

      await updateProgress(30, 'Ожидание загрузки динамического контента');
      await this.waitForDynamicContent(page);

      await updateProgress(40, 'Получение HTML-контента страницы');
      const htmlSnapshot = await page.content();

      await updateProgress(50, 'Создание скриншота страницы');
      const screenshotUrl = await this.screenshotService.takeFullPageScreenshot(
        page,
        scanId,
      );

      await updateProgress(60, 'Извлечение элементов страницы');
      const elements = await this.elementExtractor.extractElements(
        page,
        htmlSnapshot,
        scanId,
      );

      await updateProgress(80, 'Сохранение результатов в базу данных');
      await this.storageService.savePageScanResults(scanId, {
        htmlSnapshot,
        screenshotUrl,
        status: 'completed',
        elements,
      });

      await updateProgress(100, 'Сканирование завершено успешно');

      this.logger.log(`Сканирование завершено для ${pageScan.url}`);
    } catch (error) {
      this.logger.error(
        `Ошибка сканирования страницы: ${error.message}`,
        error.stack,
      );

      await updateProgress(0, `Ошибка: ${error.message}`);

      await this.prisma.pageScan.update({
        where: { id: scanId },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      });

      throw error;
    } finally {
      if (page) {
        await page.close().catch(() => {});
        // Важно: возвращаем браузер в пул после использования
        const browser = page.browser();
        this.browserPoolService.releaseBrowser(browser);
      }
    }
  }

  private async waitForDynamicContent(page: Page): Promise<void> {
    // Ждем стабилизации DOM (оптимизировано)
    await page
      .evaluate(() => {
        return new Promise<boolean>((resolve) => {
          let lastHTMLSize = 0;
          let checkCount = 0;
          const interval = setInterval(() => {
            const html = document.documentElement.outerHTML;
            const currentHTMLSize = html.length;

            if (lastHTMLSize === currentHTMLSize && checkCount > 2) {
              clearInterval(interval);
              resolve(true);
            } else {
              lastHTMLSize = currentHTMLSize;
              checkCount++;
            }
          }, 1000);

          // Обеспечиваем максимальное время ожидания
          setTimeout(() => {
            clearInterval(interval);
            resolve(false);
          }, 10000);
        });
      })
      .catch(() => {
        this.logger.warn('Таймаут ожидания стабилизации DOM');
      });

    // Дополнительное ожидание после загрузки страницы
    await sleep(1000);
  }

  private createProgressUpdater(job?: Job): ProgressUpdater {
    return async (progress: number, message?: string) => {
      this.logger.log(
        `Прогресс сканирования: ${progress}%${message ? ` - ${message}` : ''}`,
      );

      if (job) {
        await job.progress(progress);

        if (message) {
          await job.update({
            ...job.data,
            lastProgressMessage: message,
            lastProgressTime: new Date().toISOString(),
          });
        }
      }
    };
  }
}
