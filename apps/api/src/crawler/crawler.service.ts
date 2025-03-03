import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import * as puppeteer from 'puppeteer';
import { Browser, Page } from 'puppeteer';
import { PrismaService } from '../prisma/prisma.service';
import { ElementExtractorService } from './element-extractor.service';
import { ScreenshotService } from './screenshot.service';
import { StorageService } from './storage.service';

export interface ProgressUpdater {
  (progress: number, message?: string): Promise<void>;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private browser: Browser | null = null;

  constructor(
    private prisma: PrismaService,
    private elementExtractor: ElementExtractorService,
    private screenshotService: ScreenshotService,
    private storageService: StorageService,
  ) {}

  /**
   * Инициализирует браузер, если он еще не запущен
   */
  async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.logger.log('Инициализация браузера');
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Закрывает браузер если он запущен
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Создает функцию обновления прогресса на основе задачи Bull
   */
  private createProgressUpdater(job?: Job): ProgressUpdater {
    return async (progress: number, message?: string) => {
      // Логируем прогресс
      this.logger.log(
        `Прогресс сканирования: ${progress}%${message ? ` - ${message}` : ''}`,
      );

      // Если есть задача, обновляем прогресс
      if (job) {
        await job.progress(progress);

        // Сохраняем сообщение о прогрессе в метаданных задачи
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

  /**
   * Основной метод для сканирования страницы
   * @param scanId ID сканирования из базы данных
   * @param job Опциональный объект задачи Bull для обновления прогресса
   */
  async scanPage(scanId: string, job?: Job): Promise<void> {
    // Создаем обновлятель прогресса на основе задачи (или пустую функцию, если задачи нет)
    const updateProgress = this.createProgressUpdater(job);

    try {
      // Стартовый прогресс
      await updateProgress(5, 'Начало сканирования');

      // Получаем информацию о сканировании из БД
      const pageScan = await this.prisma.pageScan.findUnique({
        where: { id: scanId },
      });

      if (!pageScan) {
        throw new Error(`PageScan с ID ${scanId} не найден`);
      }

      // Обновляем статус на "в процессе"
      await this.prisma.pageScan.update({
        where: { id: scanId },
        data: { status: 'in_progress' },
      });

      await updateProgress(10, 'Инициализация браузера');

      // Инициализация браузера и создание страницы
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      // Настройка страницы
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      );

      // Добавляем обработчики для навигационных ошибок
      page.on('pageerror', (error) => {
        this.logger.warn(`Ошибка страницы: ${error.message}`);
      });

      // Настраиваем таймаут
      page.setDefaultNavigationTimeout(30000);

      this.logger.log(`Переход на ${pageScan.url}`);
      await updateProgress(15, `Загрузка страницы: ${pageScan.url}`);

      // Загрузка страницы с ожиданием сетевой активности
      await page.goto(pageScan.url, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Ожидаем загрузки динамического контента
      await updateProgress(30, 'Ожидание загрузки динамического контента');
      await this.waitForDynamicContent(page);

      // Получаем HTML страницы
      await updateProgress(40, 'Получение HTML-контента страницы');
      const htmlSnapshot = await page.content();

      // Делаем скриншот всей страницы
      await updateProgress(50, 'Создание скриншота страницы');
      const screenshotUrl = await this.screenshotService.takeFullPageScreenshot(
        page,
        scanId,
      );

      // Извлекаем элементы страницы
      await updateProgress(60, 'Извлечение элементов страницы');
      const elements = await this.elementExtractor.extractElements(
        page,
        htmlSnapshot,
        scanId,
      );

      // Сохраняем данные в базу
      await updateProgress(80, 'Сохранение результатов в базу данных');
      await this.storageService.savePageScanResults(scanId, {
        htmlSnapshot,
        screenshotUrl,
        status: 'completed',
        elements,
      });

      // Закрываем страницу
      await page.close();

      // Завершающее сообщение
      await updateProgress(100, 'Сканирование завершено успешно');

      this.logger.log(`Сканирование завершено для ${pageScan.url}`);
    } catch (error) {
      this.logger.error(
        `Ошибка сканирования страницы: ${error.message}`,
        error.stack,
      );

      // Обновляем прогресс с указанием ошибки
      await updateProgress(0, `Ошибка: ${error.message}`);

      // Обновляем статус на "ошибка"
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
   * Ожидает загрузки динамического контента на странице
   */
  private async waitForDynamicContent(page: Page): Promise<void> {
    // Ожидаем стабилизации DOM-дерева
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
        });
      })
      .catch(() => {
        this.logger.warn('Таймаут ожидания стабилизации DOM');
      });

    // Дополнительное ожидание после загрузки страницы
    // Заменяем waitForTimeout на универсальный подход
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
