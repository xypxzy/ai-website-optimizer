import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Page } from 'puppeteer';

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
   * Делает скриншот всей страницы с помощью Puppeteer
   * @param page Объект страницы Puppeteer
   * @param scanId ID сканирования
   * @returns Относительный путь к файлу скриншота
   */
  async takeFullPageScreenshot(page: Page, scanId: string): Promise<string> {
    const fileName = `page_${scanId}_${Date.now()}.jpeg`;
    const filePath = path.join(this.screenshotDir, fileName);

    try {
      await page.screenshot({
        path: filePath,
        fullPage: true,
        type: 'jpeg',
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
   * Делает скриншот отдельного элемента с помощью Puppeteer
   * @param page Объект страницы Puppeteer
   * @param selector CSS-селектор элемента
   * @param scanId ID сканирования
   * @returns Относительный путь к файлу скриншота
   */
  async takeElementScreenshot(
    page: Page,
    selector: string,
    scanId: string,
    boundingBox?: { x: number; y: number; width: number; height: number },
  ): Promise<string> {
    try {
      // Генерируем хеш селектора для использования в имени файла
      const selectorHash = crypto
        .createHash('md5')
        .update(selector)
        .digest('hex')
        .substring(0, 10);

      const fileName = `element_${scanId}_${selectorHash}_${Date.now()}.jpeg`;
      const filePath = path.join(this.screenshotDir, fileName);

      // Если у нас уже есть ограничивающий прямоугольник, используем его
      if (boundingBox) {
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
          type: 'jpeg',
        });
      } else {
        // Если нет boundingBox, пробуем найти элемент и сделать скриншот
        const elementHandle = await page.$(selector);
        if (!elementHandle) {
          this.logger.warn(`Элемент с селектором ${selector} не найден`);
          return '';
        }

        // Проверяем видимость элемента
        const isVisible = await page.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return (
            style &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0'
          );
        }, elementHandle);

        if (!isVisible) {
          this.logger.warn(`Элемент с селектором ${selector} не виден`);
          return '';
        }

        // Получаем ограничивающий прямоугольник элемента
        const box = await elementHandle.boundingBox();
        if (!box) {
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
            x: Math.max(0, box.x - padding),
            y: Math.max(0, box.y - padding),
            width: box.width + padding * 2,
            height: box.height + padding * 2,
          },
          type: 'jpeg',
        });
      }

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
