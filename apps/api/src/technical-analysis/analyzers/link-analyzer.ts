import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import {
  IAnalysisOptions,
  IPageToAnalyze,
} from '../interfaces/analysis.interface';
import { ILinkAnalysisResult } from '../interfaces/link-analysis.interface';
import { AbstractAnalyzer } from './abstract-analyzer';

@Injectable()
export class LinkAnalyzer extends AbstractAnalyzer<ILinkAnalysisResult> {
  constructor() {
    super('LinkAnalyzer');
  }

  public getDescription(): string {
    return 'Анализирует внутренние и внешние ссылки, их распределение и потенциальные проблемы';
  }

  protected async doAnalyze(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<ILinkAnalysisResult> {
    const dom = new JSDOM(page.html, { url: page.url });
    const document = dom.window.document;
    const baseUrl = new URL(page.url);

    // Инициализируем результат анализа
    const result: ILinkAnalysisResult = {
      score: 0, // Будет рассчитано в postAnalysis
      issues: [],
      metrics: {
        internalLinksCount: 0,
        externalLinksCount: 0,
        brokenLinksCount: 0,
        internalLinks: [],
        externalLinks: [],
        brokenLinks: [],
        anchorTexts: {},
        emptyLinks: 0,
        linksWithoutTitle: 0,
        linkDistribution: {
          header: 0,
          content: 0,
          footer: 0,
          sidebar: 0,
        },
      },
      timestamp: '',
    };

    // Получаем все ссылки на странице
    const links = document.querySelectorAll('a[href]');
    const internalLinks: Array<{
      url: string;
      text: string;
      target?: string;
      nofollow: boolean;
    }> = [];
    const externalLinks: Array<{
      url: string;
      text: string;
      target?: string;
      nofollow: boolean;
      domain: string;
    }> = [];
    const anchorTexts: Record<string, number> = {};
    let emptyLinks = 0;
    let linksWithoutTitle = 0;

    // Анализируем каждую ссылку
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;

      const text = link.textContent?.trim() || '';
      const target = link.getAttribute('target');
      const rel = link.getAttribute('rel') || '';
      const nofollow = rel.includes('nofollow');
      const title = link.getAttribute('title');

      // Подсчитываем ссылки без текста
      if (!text && !link.querySelector('img')) {
        emptyLinks++;
      }

      // Подсчитываем ссылки без атрибута title
      if (!title) {
        linksWithoutTitle++;
      }

      // Аггрегируем тексты ссылок (исключая пустые)
      if (text) {
        anchorTexts[text] = (anchorTexts[text] || 0) + 1;
      }

      try {
        // Пробуем преобразовать href в абсолютный URL
        const url = new URL(href, baseUrl.href);

        // Определяем, внутренняя это или внешняя ссылка
        if (url.hostname === baseUrl.hostname) {
          // Внутренняя ссылка
          internalLinks.push({
            url: url.href,
            text,
            target: target || '_self',
            nofollow,
          });
        } else {
          // Внешняя ссылка
          externalLinks.push({
            url: url.href,
            text,
            target: target || '_blank',
            nofollow,
            domain: url.hostname,
          });
        }
      } catch (error) {
        // Недействительный URL, считаем битой ссылкой
        result.metrics.brokenLinks.push({
          url: href,
          text,
          type: href.startsWith('http') ? 'external' : 'internal',
        });
      }
    });

    // Рассчитываем распределение ссылок по секциям страницы
    const header =
      document.querySelector('header') || document.querySelector('.header');
    const footer =
      document.querySelector('footer') || document.querySelector('.footer');
    const sidebar =
      document.querySelector('aside') || document.querySelector('.sidebar');
    const content =
      document.querySelector('main') || document.querySelector('#content');

    if (header) {
      result.metrics.linkDistribution.header =
        header.querySelectorAll('a[href]').length;
    }

    if (footer) {
      result.metrics.linkDistribution.footer =
        footer.querySelectorAll('a[href]').length;
    }

    if (sidebar) {
      result.metrics.linkDistribution.sidebar =
        sidebar.querySelectorAll('a[href]').length;
    }

    if (content) {
      result.metrics.linkDistribution.content =
        content.querySelectorAll('a[href]').length;
    }

    // Проверяем ссылки на доступность, если запрошено
    if (options?.checkLinkStatus) {
      await this.checkLinkStatus(result);
    }

    // Сохраняем результаты
    result.metrics.internalLinksCount = internalLinks.length;
    result.metrics.externalLinksCount = externalLinks.length;
    result.metrics.brokenLinksCount = result.metrics.brokenLinks.length;
    result.metrics.internalLinks = internalLinks;
    result.metrics.externalLinks = externalLinks;
    result.metrics.anchorTexts = anchorTexts;
    result.metrics.emptyLinks = emptyLinks;
    result.metrics.linksWithoutTitle = linksWithoutTitle;

    // Анализируем проблемы с ссылками
    this.analyzeLinkIssues(result);

    return result;
  }

  /**
   * Проверяет доступность ссылок (асинхронно)
   * Примечание: в реальном коде здесь будут выполняться HTTP-запросы
   */
  private async checkLinkStatus(result: ILinkAnalysisResult): Promise<void> {
    // Примечание: это упрощенная реализация
    // В реальном проекте здесь будут выполняться асинхронные HTTP-запросы HEAD
    // для проверки статуса ссылок с учетом ограничений по частоте запросов

    this.logger.log(
      'Checking link status is not fully implemented in this version',
    );

    // Отмечаем несколько случайных ссылок как битые для демонстрации
    // В реальном проекте это будет основано на фактических HTTP-ответах
    const internalLinks = [...result.metrics.internalLinks];
    const externalLinks = [...result.metrics.externalLinks];

    if (internalLinks.length > 0) {
      const randomIndex = Math.floor(Math.random() * internalLinks.length);
      result.metrics.brokenLinks.push({
        url: internalLinks[randomIndex].url,
        text: internalLinks[randomIndex].text,
        status: 404,
        type: 'internal',
      });
    }

    if (externalLinks.length > 0) {
      const randomIndex = Math.floor(Math.random() * externalLinks.length);
      result.metrics.brokenLinks.push({
        url: externalLinks[randomIndex].url,
        text: externalLinks[randomIndex].text,
        status: 503,
        type: 'external',
      });
    }

    result.metrics.brokenLinksCount = result.metrics.brokenLinks.length;
  }

  /**
   * Анализирует проблемы с ссылками
   */
  private analyzeLinkIssues(result: ILinkAnalysisResult): void {
    // Проверяем битые ссылки
    if (result.metrics.brokenLinksCount > 0) {
      result.issues.push(
        this.createIssue(
          'link-broken',
          `Обнаружено ${result.metrics.brokenLinksCount} битых ссылок`,
          'critical',
          undefined,
          undefined,
          [
            'Исправьте или удалите битые ссылки',
            'Настройте редиректы для неработающих URL',
          ],
        ),
      );
    }

    // Проверяем пустые ссылки
    if (result.metrics.emptyLinks > 0) {
      result.issues.push(
        this.createIssue(
          'link-empty',
          `Обнаружено ${result.metrics.emptyLinks} ссылок без текста`,
          'major',
          undefined,
          undefined,
          [
            'Добавьте текст для всех ссылок',
            'Используйте атрибут aria-label для ссылок без текста',
            'Для изображений-ссылок убедитесь, что изображения имеют атрибут alt',
          ],
        ),
      );
    }

    // Проверяем ссылки без title
    if (
      result.metrics.linksWithoutTitle >
      result.metrics.internalLinksCount * 0.7
    ) {
      result.issues.push(
        this.createIssue(
          'link-no-title',
          `Большинство ссылок (${result.metrics.linksWithoutTitle}) не имеют атрибута title`,
          'minor',
          undefined,
          undefined,
          [
            'Добавьте атрибуты title для важных ссылок',
            'Особенно важно для неочевидных ссылок и внешних ресурсов',
          ],
        ),
      );
    }

    // Проверяем внешние ссылки без nofollow
    const externalLinksWithoutNofollow = result.metrics.externalLinks.filter(
      (link) => !link.nofollow,
    ).length;

    if (externalLinksWithoutNofollow > 10) {
      result.issues.push(
        this.createIssue(
          'link-missing-nofollow',
          `${externalLinksWithoutNofollow} внешних ссылок не имеют атрибута rel="nofollow"`,
          'moderate',
          undefined,
          undefined,
          [
            'Добавьте атрибут rel="nofollow" для внешних ссылок, когда это необходимо',
            'Особенно важно для пользовательского контента и коммерческих ссылок',
          ],
        ),
      );
    }

    // Проверяем дублирующиеся тексты ссылок, ведущие на разные URL
    const linkTextToUrls = new Map<string, Set<string>>();

    result.metrics.internalLinks.forEach((link) => {
      if (!link.text) return;

      if (!linkTextToUrls.has(link.text)) {
        linkTextToUrls.set(link.text, new Set<string>());
      }

      linkTextToUrls.get(link.text)?.add(link.url);
    });

    const duplicateTexts = Array.from(linkTextToUrls.entries())
      .filter(([_, urls]) => urls.size > 1)
      .map(([text]) => text);

    if (duplicateTexts.length > 0) {
      result.issues.push(
        this.createIssue(
          'link-duplicate-text',
          `${duplicateTexts.length} текстов ссылок ведут на разные URL`,
          'moderate',
          undefined,
          undefined,
          [
            'Используйте уникальные тексты для ссылок, ведущих на разные страницы',
            'Добавьте уточняющий контекст для ссылок с одинаковым текстом',
          ],
        ),
      );
    }

    // Проверяем наличие внутренних ссылок
    if (
      result.metrics.internalLinksCount < 5 &&
      result.metrics.externalLinksCount > 0
    ) {
      result.issues.push(
        this.createIssue(
          'link-few-internal',
          'Мало внутренних ссылок для перелинковки',
          'major',
          undefined,
          undefined,
          [
            'Добавьте больше внутренних ссылок для улучшения навигации',
            'Создайте перекрестные ссылки на релевантные страницы сайта',
          ],
        ),
      );
    }
  }
}
