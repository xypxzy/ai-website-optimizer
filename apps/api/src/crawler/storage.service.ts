import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
      // Транзакция для атомарного обновления данных
      await this.prisma.$transaction(async (tx) => {
        // Обновляем данные сканирования
        await tx.pageScan.update({
          where: { id: scanId },
          data: {
            htmlSnapshot,
            screenshotUrl,
            status,
            completedAt: new Date(),
          },
        });

        // Сперва сохраняем все элементы без родительских ссылок
        const elementIdMap = new Map<string, string>(); // Карта селектор -> ID элемента

        // Первый проход: создаем все элементы
        for (const element of elements) {
          const newElement = await tx.element.create({
            data: {
              pageScanId: scanId,
              type: element.type,
              html: element.html,
              selector: element.selector,
              screenshot: element.screenshot || null,
              hierarchyLevel: element.hierarchyLevel,
              // Родительский элемент будет установлен во втором проходе
            },
          });

          elementIdMap.set(element.selector, newElement.id);
        }

        // Второй проход: обновляем родительские ссылки
        for (const element of elements) {
          if (
            element.parentSelector &&
            elementIdMap.has(element.parentSelector)
          ) {
            const elementId = elementIdMap.get(element.selector);
            const parentId = elementIdMap.get(element.parentSelector);

            if (elementId && parentId) {
              await tx.element.update({
                where: { id: elementId },
                data: {
                  parentElementId: parentId,
                },
              });
            }
          }
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
}
