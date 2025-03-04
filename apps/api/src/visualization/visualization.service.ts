import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import * as diff from 'diff';
import { PrismaService } from 'src/prisma/prisma.service';
import { PreviewStorageService } from './services/preview-storage.service';
import { RenderService } from './services/render.service';

@Injectable()
export class VisualizationService {
  private readonly logger = new Logger(VisualizationService.name);

  constructor(
    private prisma: PrismaService,
    private renderService: RenderService,
    private previewStorageService: PreviewStorageService,
  ) {}

  /**
   * Создает визуализацию для рекомендации
   */
  async createVisualization(recommendationId: string): Promise<string> {
    try {
      // Получаем рекомендацию из базы данных
      const recommendation = await this.prisma.recommendation.findUnique({
        where: { id: recommendationId },
        include: {
          element: true,
          prompt: {
            include: {
              pageScan: true,
            },
          },
        },
      });

      if (!recommendation) {
        throw new Error(`Recommendation with ID ${recommendationId} not found`);
      }

      // Получаем оригинальный HTML элемента или страницы
      const originalHtml = recommendation.element
        ? recommendation.element.html
        : (recommendation.prompt.pageScan.htmlSnapshot ?? '');

      // Применяем изменения к HTML
      const modifiedHtml = await this.applyChanges(
        originalHtml,
        recommendation.implementation,
      );

      // Генерируем визуальные превью
      const { originalScreenshotUrl, previewImageUrl } =
        await this.renderService.createVisualPreviews(
          originalHtml,
          modifiedHtml,
          recommendationId,
        );

      // Сохраняем превью в базе данных
      const preview = await this.previewStorageService.savePreview({
        recommendationId,
        originalHtml,
        modifiedHtml,
        originalScreenshotUrl,
        previewImageUrl,
      });

      return preview.id;
    } catch (error) {
      this.logger.error(
        `Error creating visualization: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Применяет изменения к HTML на основе рекомендации
   */
  async applyChanges(
    originalHtml: string,
    implementation: string,
  ): Promise<string> {
    try {
      // Проверяем, содержит ли implementation готовый HTML
      if (this.isCompleteHtml(implementation)) {
        return this.cleanHtmlCode(implementation);
      }

      // Извлекаем HTML и CSS из implementation
      const { html, css } = this.extractHtmlAndCss(implementation);

      if (html) {
        // Если есть HTML, пытаемся найти и заменить соответствующий элемент
        return this.replaceElementInHtml(originalHtml, html);
      } else if (css) {
        // Если только CSS, применяем его к оригинальному HTML
        return this.applyCssToHtml(originalHtml, css);
      }

      // Если не удалось извлечь изменения, возвращаем оригинальный HTML
      return originalHtml;
    } catch (error) {
      this.logger.error(
        `Error applying changes: ${error.message}`,
        error.stack,
      );
      return originalHtml;
    }
  }

  /**
   * Проверяет, является ли строка полным HTML-документом
   */
  private isCompleteHtml(htmlString: string): boolean {
    const cleanHtml = this.cleanHtmlCode(htmlString);
    return (
      cleanHtml.trim().startsWith('<') &&
      (cleanHtml.includes('<html') ||
        cleanHtml.includes('<body') ||
        cleanHtml.includes('<div') ||
        cleanHtml.includes('<section'))
    );
  }

  /**
   * Очищает HTML-код от комментариев и лишних пробелов
   */
  private cleanHtmlCode(htmlCode: string): string {
    return htmlCode
      .replace(/```html/g, '')
      .replace(/```/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
  }

  /**
   * Извлекает HTML и CSS из кода реализации
   */
  private extractHtmlAndCss(implementation: string): {
    html: string;
    css: string;
  } {
    // Очищаем код от символов маркировки кода
    const cleanImplementation = this.cleanHtmlCode(implementation);

    // Извлекаем CSS из тегов <style>
    let css = '';
    const styleMatch = cleanImplementation.match(
      /<style[^>]*>([\s\S]*?)<\/style>/i,
    );
    if (styleMatch && styleMatch[1]) {
      css = styleMatch[1].trim();
    }

    // Извлекаем HTML без тегов <style>
    let html = cleanImplementation
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .trim();

    // Проверяем, есть ли в оставшемся коде HTML-теги
    if (!html.match(/<[^>]+>/)) {
      // Если нет HTML-тегов, проверяем, может быть это CSS вне тега <style>
      if (
        html.includes('{') &&
        html.includes('}') &&
        (html.includes(':') || html.includes('='))
      ) {
        css += html;
        html = '';
      }
    }

    return { html, css };
  }

  /**
   * Заменяет элемент в HTML
   */
  private replaceElementInHtml(
    originalHtml: string,
    newElementHtml: string,
  ): string {
    try {
      // Загружаем оригинальный HTML в Cheerio
      const $ = cheerio.load(originalHtml);

      // Попытаемся определить тип элемента, который нужно заменить
      const newElementWrapper = cheerio.load(
        `<div id="new-element-wrapper">${newElementHtml}</div>`,
      );
      const newElement = newElementWrapper('#new-element-wrapper')
        .children()
        .first();

      if (!newElement.length) {
        return originalHtml;
      }

      const tagName = newElement.get(0).tagName;
      const classes = newElement.attr('class');
      const id = newElement.attr('id');

      // Попробуем найти соответствующий элемент по тегу и классу/id
      let targetElement;

      if (id) {
        targetElement = $(`#${id}`);
      }

      if (!targetElement || !targetElement.length) {
        if (classes) {
          const classSelector = classes
            .split(/\s+/)
            .map((c) => `.${c}`)
            .join('');
          targetElement = $(tagName + classSelector);
        }
      }

      if (!targetElement || !targetElement.length) {
        // Если по классам и id не найдено, ищем по тегу
        targetElement = $(tagName).first();
      }

      // Если нашли элемент, заменяем его
      if (targetElement && targetElement.length) {
        targetElement.replaceWith(newElementHtml);
        return $.html();
      }

      // Если не нашли элемент, просто добавляем новый в body
      $('body').append(newElementHtml);
      return $.html();
    } catch (error) {
      this.logger.error(
        `Error replacing element: ${error.message}`,
        error.stack,
      );
      return originalHtml;
    }
  }

  /**
   * Применяет CSS к HTML
   */
  private applyCssToHtml(originalHtml: string, cssStyles: string): string {
    try {
      // Загружаем оригинальный HTML в Cheerio
      const $ = cheerio.load(originalHtml);

      // Проверяем, есть ли уже тег <style> в документе
      let styleTag = $('head style');

      if (!styleTag.length) {
        // Если нет, создаем новый
        $('head').append('<style type="text/css"></style>');
        styleTag = $('head style');
      }

      // Добавляем CSS стили
      styleTag.append(cssStyles);

      return $.html();
    } catch (error) {
      this.logger.error(`Error applying CSS: ${error.message}`, error.stack);
      return originalHtml;
    }
  }

  /**
   * Выделяет различия между оригинальным и измененным HTML
   */
  async highlightDifferences(
    originalHtml: string,
    modifiedHtml: string,
  ): Promise<string> {
    try {
      // Используем библиотеку diff для поиска различий
      const diffResult = diff.diffChars(originalHtml, modifiedHtml);

      // Форматируем результат с выделением изменений
      let highlightedHtml = '';
      diffResult.forEach((part) => {
        const color = part.added ? 'green' : part.removed ? 'red' : 'grey';
        const htmlPart = part.value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        highlightedHtml += `<span style="color: ${color}">${htmlPart}</span>`;
      });

      return highlightedHtml;
    } catch (error) {
      this.logger.error(
        `Error highlighting differences: ${error.message}`,
        error.stack,
      );
      return modifiedHtml;
    }
  }

  /**
   * Получает визуальное превью для рекомендации
   */
  async getVisualization(recommendationId: string): Promise<any> {
    try {
      const preview = await this.prisma.preview.findUnique({
        where: { recommendationId },
      });

      if (!preview) {
        // Если превью не существует, создаем его
        await this.createVisualization(recommendationId);
        return this.getVisualization(recommendationId);
      }

      // Добавляем выделение различий
      const highlightedDiff = await this.highlightDifferences(
        preview.originalHtml,
        preview.modifiedHtml,
      );

      return {
        ...preview,
        highlightedDiff,
      };
    } catch (error) {
      this.logger.error(
        `Error getting visualization: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
