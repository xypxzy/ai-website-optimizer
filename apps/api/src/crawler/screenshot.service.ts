import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Page } from 'playwright';

@Injectable()
export class ScreenshotService {
  private readonly logger = new Logger(ScreenshotService.name);
  private readonly screenshotDir = 'uploads/screenshots';

  constructor() {
    // Убеждаемся, что директория для скриншотов существует
    this.ensureDirectoryExists();
  }

  /**
   * Создает директорию для скриншотов, если она не существует
   */
  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.screenshotDir, { recursive: true });
    } catch (error) {
      this.logger.error(
        `Не удалось создать директорию для скриншотов: ${error.message}`,
      );
    }
  }

  /**
   * Делает скриншот всей страницы
   * @param page Объект страницы Playwright
   * @param scanId ID сканирования
   * @returns Относительный путь к файлу скриншота
   */
  async takeFullPageScreenshot(page: Page, scanId: string): Promise<string> {
    const fileName = `page_${scanId}_${Date.now()}.png`;
    const filePath = path.join(this.screenshotDir, fileName);

    try {
      await page.screenshot({
        path: filePath,
        fullPage: true,
        type: 'png',
        quality: 80,
      });

      // Проверяем, что файл создан успешно
      await fs.access(filePath);

      return fileName; // Возвращаем относительный путь для хранения в БД
    } catch (error) {
      this.logger.error(
        `Не удалось создать скриншот страницы: ${error.message}`,
      );
      return '';
    }
  }

  /**
   * Делает скриншот отдельного элемента
   * @param page Объект страницы Playwright
   * @param selector CSS-селектор элемента
   * @param scanId ID сканирования
   * @returns Относительный путь к файлу скриншота
   */
  async takeElementScreenshot(
    page: Page,
    selector: string,
    scanId: string,
  ): Promise<string> {
    try {
      const element = await page.$(selector);

      if (!element) {
        this.logger.warn(`Элемент с селектором ${selector} не найден`);
        return '';
      }

      // Проверяем видимость элемента
      const isVisible = await element.isVisible();
      if (!isVisible) {
        this.logger.warn(`Элемент с селектором ${selector} не виден`);
        return '';
      }

      // Генерируем хеш селектора для использования в имени файла
      const selectorHash = crypto
        .createHash('md5')
        .update(selector)
        .digest('hex')
        .substring(0, 10);

      const fileName = `element_${scanId}_${selectorHash}_${Date.now()}.png`;
      const filePath = path.join(this.screenshotDir, fileName);

      // Получаем ограничивающий прямоугольник элемента
      const boundingBox = await element.boundingBox();

      if (!boundingBox) {
        this.logger.warn(
          `Не удалось получить ограничивающий прямоугольник для элемента с селектором ${selector}`,
        );
        return '';
      }

      // Делаем скриншот с небольшим отступом вокруг элемента
      const padding = 5;
      await page.screenshot({
        path: filePath,
        clip: {
          x: Math.max(0, boundingBox.x - padding),
          y: Math.max(0, boundingBox.y - padding),
          width: boundingBox.width + padding * 2,
          height: boundingBox.height + padding * 2,
        },
        type: 'png',
        quality: 80,
      });

      // Проверяем, что файл создан успешно
      await fs.access(filePath);

      return fileName; // Возвращаем относительный путь для хранения в БД
    } catch (error) {
      this.logger.error(
        `Не удалось создать скриншот элемента: ${error.message}`,
      );
      return '';
    }
  }
}
