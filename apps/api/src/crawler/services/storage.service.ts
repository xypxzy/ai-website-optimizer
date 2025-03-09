import { Injectable, Logger } from '@nestjs/common';
import * as htmlMinify from 'html-minifier';
import { PrismaService } from 'src/prisma/prisma.service';
import { ElementData } from './element-extractor.service';

interface PageScanResults {
  htmlSnapshot: string;
  screenshotUrl: string;
  status: string;
  elements: ElementData[];
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Сохраняет результаты сканирования страницы в базу данных
   * @param scanId ID сканирования
   * @param results Результаты сканирования
   */
  async savePageScanResults(
    scanId: string,
    results: PageScanResults,
  ): Promise<void> {
    const { htmlSnapshot, screenshotUrl, status, elements } = results;

    try {
      // Минифицируем HTML для экономии места
      const minifiedHtml = this.minifyHtml(htmlSnapshot);

      // Транзакция для атомарного обновления данных
      await this.prisma.$transaction(async (tx) => {
        // Обновляем данные сканирования
        await tx.pageScan.update({
          where: { id: scanId },
          data: {
            htmlSnapshot: minifiedHtml,
            screenshotUrl,
            status,
            completedAt: new Date(),
          },
        });

        // Сперва сохраняем все элементы без родительских ссылок
        const elementIdMap = new Map<string, string>(); // Карта селектор -> ID элемента

        // Для оптимизации, обрабатываем элементы пакетами
        const batchSize = 100;
        for (let i = 0; i < elements.length; i += batchSize) {
          const batch = elements.slice(i, i + batchSize);
          const promises = batch.map((element) =>
            tx.element.create({
              data: {
                pageScanId: scanId,
                type: element.type,
                html: this.minifyHtml(element.html), // Минифицируем HTML элемента
                selector: element.selector,
                screenshot: element.screenshot || null,
                hierarchyLevel: element.hierarchyLevel,
                // Родительский элемент будет установлен во втором проходе
              },
            }),
          );

          const createdElements = await Promise.all(promises);

          // Заполняем карту соответствия
          batch.forEach((element, index) => {
            elementIdMap.set(element.selector, createdElements[index].id);
          });
        }

        // Второй проход: обновляем родительские ссылки
        const updatePromises: Promise<any>[] = [];
        for (const element of elements) {
          if (
            element.parentSelector &&
            elementIdMap.has(element.parentSelector)
          ) {
            const elementId = elementIdMap.get(element.selector);
            const parentId = elementIdMap.get(element.parentSelector);

            if (elementId && parentId) {
              updatePromises.push(
                tx.element.update({
                  where: { id: elementId },
                  data: {
                    parentElementId: parentId,
                  },
                }),
              );

              // Обрабатываем обновления пакетами
              if (updatePromises.length >= batchSize) {
                await Promise.all(updatePromises);
                updatePromises.length = 0;
              }
            }
          }
        }

        // Обрабатываем оставшиеся обновления
        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
        }
      });

      this.logger.log(
        `Результаты сканирования для ${scanId} успешно сохранены в базе данных`,
      );
    } catch (error) {
      this.logger.error(
        `Ошибка сохранения результатов сканирования: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Минифицирует HTML для уменьшения размера хранимых данных
   */
  private minifyHtml(html: string): string {
    try {
      return htmlMinify.minify(html, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
      });
    } catch (error) {
      this.logger.warn(`Ошибка минификации HTML: ${error.message}`);
      return html; // В случае ошибки возвращаем оригинальный HTML
    }
  }
}
