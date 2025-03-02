import { Injectable, Logger } from '@nestjs/common';
import { Browser, chromium, Page } from 'playwright';
import { PrismaService } from '../prisma/prisma.service';
import { ElementExtractorService } from './element-extractor.service';
// import { ScreenshotService } from './screenshot.service';
import { StorageService } from './storage.service';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private browser: Browser | null = null;

  constructor(
    private prisma: PrismaService,
    private elementExtractor: ElementExtractorService,
    // private screenshotService: ScreenshotService,
    private storageService: StorageService,
  ) {}

  /**
   * Инициализирует браузер, если он еще не запущен
   */
  async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.logger.log('Инициализация браузера');
      this.browser = await chromium.launch({
        headless: true,
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
   * Основной метод для сканирования страницы
   * @param scanId ID сканирования из базы данных
   */
  async scanPage(scanId: string): Promise<void> {
    try {
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

      // Инициализация браузера и создание контекста
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      });
      const page = await context.newPage();

      // Добавляем обработчики для навигационных ошибок
      page.on('pageerror', (error) => {
        this.logger.warn(`Ошибка страницы: ${error.message}`);
      });

      // Настраиваем таймаут
      page.setDefaultTimeout(30000);

      this.logger.log(`Переход на ${pageScan.url}`);

      // Загрузка страницы с ожиданием сетевой активности
      await page.goto(pageScan.url, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      // Ожидаем загрузки динамического контента
      await page.waitForLoadState('domcontentloaded');
      await this.waitForDynamicContent(page);

      // Получаем HTML страницы
      const htmlSnapshot = await page.content();

      // TODO: Implement full page screenshot
      // Делаем скриншот всей страницы
      // const screenshotUrl = await this.screenshotService.takeFullPageScreenshot(
      //   page,
      //   scanId,
      // );
      const screenshotUrl = '';

      // Извлекаем элементы страницы
      const elements = await this.elementExtractor.extractElements(
        page,
        scanId,
      );

      // Сохраняем данные в базу
      await this.storageService.savePageScanResults(scanId, {
        htmlSnapshot,
        screenshotUrl,
        status: 'completed',
        elements,
      });

      // Закрываем контекст браузера
      await context.close();

      this.logger.log(`Сканирование завершено для ${pageScan.url}`);
    } catch (error) {
      this.logger.error(
        `Ошибка сканирования страницы: ${error.message}`,
        error.stack,
      );

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
      .waitForFunction(
        () => {
          return new Promise((resolve) => {
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
        },
        { timeout: 10000 },
      )
      .catch(() => {
        this.logger.warn('Таймаут ожидания стабилизации DOM');
      });
  }
}
