import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Browser, Page } from 'puppeteer';
import { CrawlerService } from '../../crawler/crawler.service';
import { ScreenshotService } from '../../crawler/screenshot.service';

@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);
  private readonly tempDir = 'uploads/temp';
  private readonly previewDir = 'uploads/previews';

  constructor(
    private crawlerService: CrawlerService,
    private screenshotService: ScreenshotService,
  ) {
    // Создаем директории при инициализации
    this.ensureDirectoryExists(this.tempDir);
    this.ensureDirectoryExists(this.previewDir);
  }

  /**
   * Создает директорию, если она не существует
   */
  private async ensureDirectoryExists(directory: string): Promise<void> {
    try {
      await fs.mkdir(directory, { recursive: true });
    } catch (error) {
      this.logger.error(
        `Error creating directory ${directory}: ${error.message}`,
      );
    }
  }

  /**
   * Создает визуальные превью для оригинального и измененного HTML
   */
  async createVisualPreviews(
    originalHtml: string,
    modifiedHtml: string,
    recommendationId: string,
  ): Promise<{ originalScreenshotUrl: string; previewImageUrl: string }> {
    let browser: Browser | null = null;
    try {
      // Получаем или инициализируем браузер
      browser = await this.crawlerService.initBrowser();

      // Создаем уникальные идентификаторы файлов на основе хеша содержимого
      const originalHash = crypto
        .createHash('md5')
        .update(originalHtml)
        .digest('hex')
        .substring(0, 8);
      const modifiedHash = crypto
        .createHash('md5')
        .update(modifiedHtml)
        .digest('hex')
        .substring(0, 8);
      const filenameBase = `${recommendationId.substring(0, 8)}_${Date.now()}`;

      // Создаем временные HTML-файлы
      const originalHtmlPath = path.join(
        this.tempDir,
        `${filenameBase}_original_${originalHash}.html`,
      );
      const modifiedHtmlPath = path.join(
        this.tempDir,
        `${filenameBase}_modified_${modifiedHash}.html`,
      );

      await fs.writeFile(
        originalHtmlPath,
        this.wrapHtmlForRendering(originalHtml),
      );
      await fs.writeFile(
        modifiedHtmlPath,
        this.wrapHtmlForRendering(modifiedHtml),
      );

      // Делаем скриншоты
      const originalScreenshotUrl = await this.takeScreenshotOfFile(
        browser,
        originalHtmlPath,
        `original_${filenameBase}.jpeg`,
      );
      const previewImageUrl = await this.takeScreenshotOfFile(
        browser,
        modifiedHtmlPath,
        `modified_${filenameBase}.jpeg`,
      );

      // Удаляем временные файлы
      await fs.unlink(originalHtmlPath).catch(() => {});
      await fs.unlink(modifiedHtmlPath).catch(() => {});

      return { originalScreenshotUrl, previewImageUrl };
    } catch (error) {
      this.logger.error(
        `Error creating visual previews: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      // Не закрываем браузер здесь, так как он инициализирован в CrawlerService
    }
  }

  /**
   * Оборачивает HTML-фрагмент в полный HTML-документ для рендеринга
   */
  private wrapHtmlForRendering(htmlFragment: string): string {
    // Проверяем, является ли фрагмент уже полным HTML-документом
    if (htmlFragment.includes('<html') && htmlFragment.includes('<body')) {
      return htmlFragment;
    }

    // Если это просто фрагмент, оборачиваем его в базовый HTML-шаблон
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }
        </style>
      </head>
      <body>
        ${htmlFragment}
      </body>
      </html>
    `;
  }

  /**
   * Делает скриншот HTML-файла
   */
  private async takeScreenshotOfFile(
    browser: Browser,
    htmlFilePath: string,
    outputFilename: string,
  ): Promise<string> {
    let page: Page | null = null;
    try {
      page = await browser.newPage();

      // Настройка страницы
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      );

      // Загружаем HTML-файл
      const fileUrl = `file://${path.resolve(htmlFilePath)}`;
      await page.goto(fileUrl, { waitUntil: 'networkidle2' });

      // Ждем загрузку всех ресурсов
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          // Проверка загрузки всех изображений и других ресурсов
          if (document.readyState === 'complete') {
            resolve();
          } else {
            window.addEventListener('load', () => resolve());
          }
        });
      });

      // Делаем скриншот
      const screenshotPath = path.join(this.previewDir, outputFilename);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        type: 'jpeg',
        quality: 90,
      });

      return outputFilename;
    } catch (error) {
      this.logger.error(
        `Error taking screenshot: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Создает дополнительный скриншот с выделением изменений
   */
  async createDiffHighlightScreenshot(
    originalHtml: string,
    modifiedHtml: string,
    recommendationId: string,
  ): Promise<string> {
    let browser: Browser | null = null;
    try {
      browser = await this.crawlerService.initBrowser();

      // Генерируем HTML с выделенными различиями
      const diffHtml = this.generateDiffHighlightHtml(
        originalHtml,
        modifiedHtml,
      );

      // Создаем временный файл
      const filenameBase = `${recommendationId.substring(0, 8)}_${Date.now()}`;
      const diffHtmlPath = path.join(this.tempDir, `${filenameBase}_diff.html`);

      await fs.writeFile(diffHtmlPath, diffHtml);

      // Делаем скриншот
      const diffScreenshotUrl = await this.takeScreenshotOfFile(
        browser,
        diffHtmlPath,
        `diff_${filenameBase}.jpeg`,
      );

      // Удаляем временный файл
      await fs.unlink(diffHtmlPath).catch(() => {});

      return diffScreenshotUrl;
    } catch (error) {
      this.logger.error(
        `Error creating diff highlight screenshot: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Генерирует HTML с выделенными различиями
   */
  private generateDiffHighlightHtml(
    originalHtml: string,
    modifiedHtml: string,
  ): string {
    // Здесь можно использовать библиотеку difflib или аналогичную для генерации diff
    // Для простоты, мы просто размещаем два HTML бок о бок
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }
          .diff-container {
            display: flex;
            width: 100%;
          }
          .original, .modified {
            width: 50%;
            padding: 10px;
            overflow: auto;
          }
          .original {
            background-color: #ffeeee;
          }
          .modified {
            background-color: #eeffee;
          }
          h3 {
            margin-top: 0;
          }
        </style>
      </head>
      <body>
        <div class="diff-container">
          <div class="original">
            <h3>Original</h3>
            ${originalHtml}
          </div>
          <div class="modified">
            <h3>Modified</h3>
            ${modifiedHtml}
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
