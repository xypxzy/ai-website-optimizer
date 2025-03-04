import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface PreviewData {
  recommendationId: string;
  originalHtml: string;
  modifiedHtml: string;
  originalScreenshotUrl: string;
  previewImageUrl: string;
  diffImageUrl?: string;
}

@Injectable()
export class PreviewStorageService {
  private readonly logger = new Logger(PreviewStorageService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Сохраняет превью в базе данных
   */
  async savePreview(previewData: PreviewData): Promise<any> {
    try {
      // Проверяем существует ли уже превью для этой рекомендации
      const existingPreview = await this.prisma.preview.findUnique({
        where: { recommendationId: previewData.recommendationId },
      });

      if (existingPreview) {
        // Обновляем существующее превью
        return this.prisma.preview.update({
          where: { id: existingPreview.id },
          data: {
            originalHtml: previewData.originalHtml,
            modifiedHtml: previewData.modifiedHtml,
            originalScreenshotUrl: previewData.originalScreenshotUrl,
            previewImageUrl: previewData.previewImageUrl,
            updatedAt: new Date(),
          },
        });
      } else {
        // Создаем новое превью
        return this.prisma.preview.create({
          data: {
            recommendationId: previewData.recommendationId,
            originalHtml: previewData.originalHtml,
            modifiedHtml: previewData.modifiedHtml,
            originalScreenshotUrl: previewData.originalScreenshotUrl,
            previewImageUrl: previewData.previewImageUrl,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Error saving preview: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Получает превью по ID рекомендации
   */
  async getPreviewByRecommendationId(recommendationId: string): Promise<any> {
    try {
      return this.prisma.preview.findUnique({
        where: { recommendationId },
      });
    } catch (error) {
      this.logger.error(`Error getting preview: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Обновляет превью с добавлением изображения различий
   */
  async updatePreviewWithDiffImage(
    previewId: string,
    diffImageUrl: string,
  ): Promise<any> {
    try {
      return this.prisma.preview.update({
        where: { id: previewId },
        data: {
          previewImageUrl: diffImageUrl,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Error updating preview with diff image: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Удаляет превью
   */
  async deletePreview(previewId: string): Promise<boolean> {
    try {
      await this.prisma.preview.delete({
        where: { id: previewId },
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Error deleting preview: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }
}
