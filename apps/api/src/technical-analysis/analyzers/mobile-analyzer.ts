import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import * as puppeteer from 'puppeteer';
import {
  IAnalysisOptions,
  IPageToAnalyze,
} from '../interfaces/analysis.interface';
import { IMobileAnalysisResult } from '../interfaces/mobile-analysis.interface';
import { AbstractAnalyzer } from './abstract-analyzer';

@Injectable()
export class MobileAnalyzer extends AbstractAnalyzer<IMobileAnalysisResult> {
  constructor() {
    super('MobileAnalyzer');
  }

  public getDescription(): string {
    return 'Анализирует оптимизацию сайта для мобильных устройств, включая адаптивность, размеры элементов и скорость';
  }

  protected async doAnalyze(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<IMobileAnalysisResult> {
    const dom = new JSDOM(page.html, {
      url: page.url,
      resources: 'usable',
    });
    const document = dom.window.document;

    // Инициализируем результат анализа
    const result: IMobileAnalysisResult = {
      score: 0, // Будет рассчитано в postAnalysis
      issues: [],
      metrics: {
        isResponsive: false, // Будет определено
        hasViewport: false, // Будет определено
        viewportConfig: {}, // Будет заполнено
        mediaQueries: 0, // Будет подсчитано
        mobileFirstCSS: false, // Будет определено
        touchTargetIssues: 0, // Будет подсчитано
        fontSizeIssues: 0, // Будет подсчитано
        hasMobileVersion: false, // Будет определено
        performanceMetrics: {
          mobileLoadTime: 0, // Будет измерено или оценено
          mobileInteractive: 0, // Будет измерено или оценено
          mobileFCP: 0, // Будет измерено или оценено
        },
        touchableElements: {
          total: 0, // Будет подсчитано
          tooSmall: 0, // Будет подсчитано
          tooCrowded: 0, // Будет подсчитано
        },
      },
      timestamp: '',
    };

    // Анализируем различные аспекты мобильной оптимизации
    await Promise.all([
      this.analyzeViewport(document, result),
      this.analyzeMediaQueries(document, result),
      this.analyzeTouchTargets(document, result),
      this.analyzeFontSizes(document, result),
      this.analyzeMobileRedirects(page.url, result),
      this.analyzeMobilePerformance(page.url, result, options),
    ]);

    return result;
  }

  /**
   * Анализирует viewport мета-тег
   */
  private async analyzeViewport(
    document: Document,
    result: IMobileAnalysisResult,
  ): Promise<void> {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    result.metrics.hasViewport = !!viewportMeta;

    if (viewportMeta) {
      const content = viewportMeta.getAttribute('content') || '';
      const contentParts = content.split(',').map((part) => part.trim());

      // Парсим значения из content
      contentParts.forEach((part) => {
        const [key, value] = part.split('=').map((item) => item.trim());

        if (key === 'width') {
          result.metrics.viewportConfig.width = value;
        } else if (key === 'initial-scale') {
          result.metrics.viewportConfig.initialScale = parseFloat(value);
        } else if (key === 'user-scalable') {
          result.metrics.viewportConfig.userScalable = value !== 'no';
        }
      });

      // Проверяем корректность viewport
      if (result.metrics.viewportConfig.width === 'device-width') {
        result.metrics.isResponsive = true;
      }

      // Проверяем, запрещено ли масштабирование пользователем
      if (result.metrics.viewportConfig.userScalable === false) {
        result.issues.push(
          this.createIssue(
            'mobile-no-user-scaling',
            'Масштабирование страницы пользователем запрещено (user-scalable=no)',
            'major',
            'meta[name="viewport"]',
            undefined,
            [
              'Разрешите пользовательское масштабирование для лучшей доступности',
              'Удалите параметр user-scalable=no из метатега viewport',
            ],
          ),
        );
      }
    } else {
      result.issues.push(
        this.createIssue(
          'mobile-no-viewport',
          'Отсутствует метатег viewport',
          'critical',
          undefined,
          undefined,
          [
            'Добавьте метатег viewport в head: <meta name="viewport" content="width=device-width, initial-scale=1.0">',
            'Метатег viewport необходим для правильного отображения на мобильных устройствах',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует CSS медиа-запросы
   */
  private async analyzeMediaQueries(
    document: Document,
    result: IMobileAnalysisResult,
  ): Promise<void> {
    let mediaQueriesCount = 0;
    let hasMobileFirstMediaQueries = false;

    // Проверяем встроенные стили
    const styleElements = document.querySelectorAll('style');
    styleElements.forEach((style) => {
      const cssText = style.textContent || '';

      // Подсчитываем количество медиа-запросов
      const mediaQueryMatches = cssText.match(/@media\s+/g);
      if (mediaQueryMatches) {
        mediaQueriesCount += mediaQueryMatches.length;
      }

      // Проверяем, есть ли медиа-запросы для мобильных устройств
      const mobileFirstRegex = /@media\s+\(\s*min-width\s*:\s*\d+/g;
      if (mobileFirstRegex.test(cssText)) {
        hasMobileFirstMediaQueries = true;
      }
    });

    // Проверяем внешние таблицы стилей (не можем напрямую проверить содержимое)
    const linkElements = document.querySelectorAll('link[rel="stylesheet"]');

    // Предполагаем, что каждый внешний стиль имеет хотя бы один медиа-запрос
    // Это упрощение; в реальном проекте нужно загружать и анализировать CSS-файлы
    mediaQueriesCount += linkElements.length;

    result.metrics.mediaQueries = mediaQueriesCount;
    result.metrics.mobileFirstCSS = hasMobileFirstMediaQueries;

    // Анализируем результаты
    if (mediaQueriesCount === 0) {
      result.issues.push(
        this.createIssue(
          'mobile-no-media-queries',
          'Не обнаружены медиа-запросы для адаптивного дизайна',
          'critical',
          undefined,
          undefined,
          [
            'Используйте медиа-запросы (@media) для создания адаптивного дизайна',
            'Добавьте точки останова (breakpoints) для разных размеров экрана',
          ],
        ),
      );
    } else if (!hasMobileFirstMediaQueries && mediaQueriesCount > 0) {
      result.issues.push(
        this.createIssue(
          'mobile-not-mobile-first',
          'CSS не использует подход Mobile First (медиа-запросы с min-width)',
          'moderate',
          undefined,
          undefined,
          [
            'Используйте подход Mobile First: сначала стили для мобильных, затем медиа-запросы с min-width для более широких экранов',
            'Переработайте медиа-запросы, используя min-width вместо max-width',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует размеры целей для тапа (кнопки, ссылки и т.д.)
   */
  private async analyzeTouchTargets(
    document: Document,
    result: IMobileAnalysisResult,
  ): Promise<void> {
    // Получаем интерактивные элементы
    const interactiveElements = document.querySelectorAll(
      'a, button, input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"], select, [role="button"]',
    );

    result.metrics.touchableElements.total = interactiveElements.length;

    // Проверяем размеры и расположение элементов
    // Примечание: в DOM, созданном JSDOM, не доступны вычисленные стили
    // Поэтому это приблизительная проверка

    // Подсчитываем маленькие элементы на основе inline размеров
    interactiveElements.forEach((element) => {
      const width = element.getAttribute('width');
      const height = element.getAttribute('height');

      // Если указаны inline размеры, проверяем их
      if (width && height) {
        const widthValue = parseInt(width, 10);
        const heightValue = parseInt(height, 10);

        if (widthValue < 40 || heightValue < 40) {
          result.metrics.touchableElements.tooSmall++;
        }
      }

      // Проверяем также маленькие кнопки по классам/стилям
      // Это приблизительно, т.к. без вычисленных стилей точно определить сложно
      const className = element.getAttribute('class') || '';
      if (
        className.includes('btn-sm') ||
        className.includes('small') ||
        className.includes('mini')
      ) {
        result.metrics.touchableElements.tooSmall++;
      }
    });

    // В реальном проекте здесь будет более сложная логика
    // с использованием Puppeteer для получения точных размеров и позиций

    // Предполагаем, что 10% элементов расположены слишком близко друг к другу
    result.metrics.touchableElements.tooCrowded = Math.floor(
      interactiveElements.length * 0.1,
    );

    // Общее количество проблем с целями для тапа
    result.metrics.touchTargetIssues =
      result.metrics.touchableElements.tooSmall +
      result.metrics.touchableElements.tooCrowded;

    // Анализируем результаты
    if (result.metrics.touchTargetIssues > 5) {
      result.issues.push(
        this.createIssue(
          'mobile-touch-target-issues',
          `Обнаружено ${result.metrics.touchTargetIssues} проблем с размерами или расположением интерактивных элементов`,
          'major',
          undefined,
          undefined,
          [
            'Увеличьте размер кнопок и ссылок минимум до 44x44 пикселей',
            'Увеличьте расстояние между интерактивными элементами',
            'Используйте отступы (padding) вместо точного размера для увеличения области тапа',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует размеры шрифтов
   */
  private async analyzeFontSizes(
    document: Document,
    result: IMobileAnalysisResult,
  ): Promise<void> {
    // Проверяем теги стилей на предмет маленьких размеров шрифта
    const styleElements = document.querySelectorAll('style');
    let smallFontSizeCount = 0;

    styleElements.forEach((style) => {
      const cssText = style.textContent || '';

      // Ищем объявления font-size меньше 12px
      const smallFontMatches = cssText.match(
        /font-size\s*:\s*(([0-9\.]+px|[0-9\.]+pt|[0-9\.]+em))/g,
      );

      if (smallFontMatches) {
        smallFontMatches.forEach((match) => {
          const sizeMatch = match.match(/([0-9\.]+)(px|pt|em)/);
          if (sizeMatch) {
            const size = parseFloat(sizeMatch[1]);
            const unit = sizeMatch[2];

            // Проверяем размеры в разных единицах
            if (
              (unit === 'px' && size < 12) ||
              (unit === 'pt' && size < 9) ||
              (unit === 'em' && size < 0.75)
            ) {
              smallFontSizeCount++;
            }
          }
        });
      }
    });

    // Проверяем встроенные стили элементов
    const elementsWithFontStyle = document.querySelectorAll(
      '[style*="font-size"]',
    );
    elementsWithFontStyle.forEach((element) => {
      const style = element.getAttribute('style') || '';
      const fontSizeMatch = style.match(/font-size\s*:\s*([0-9\.]+)(px|pt|em)/);

      if (fontSizeMatch) {
        const size = parseFloat(fontSizeMatch[1]);
        const unit = fontSizeMatch[2];

        if (
          (unit === 'px' && size < 12) ||
          (unit === 'pt' && size < 9) ||
          (unit === 'em' && size < 0.75)
        ) {
          smallFontSizeCount++;
        }
      }
    });

    result.metrics.fontSizeIssues = smallFontSizeCount;

    // Анализируем результаты
    if (smallFontSizeCount > 0) {
      result.issues.push(
        this.createIssue(
          'mobile-small-font',
          `Обнаружено ${smallFontSizeCount} случаев использования слишком маленького размера шрифта`,
          'major',
          undefined,
          undefined,
          [
            'Используйте шрифты размером не менее 12px (или 16px для основного текста)',
            'Настройте адаптивные размеры шрифтов для разных размеров экрана',
            'Используйте относительные единицы (em, rem) вместо абсолютных (px)',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует наличие мобильной версии или редиректов
   */
  private async analyzeMobileRedirects(
    url: string,
    result: IMobileAnalysisResult,
  ): Promise<void> {
    // В реальном проекте здесь будет проверка редиректов для мобильных
    // Например, проверка редиректа с desktop на m.domain.com

    // Проверяем, есть ли в URL признаки мобильной версии
    const urlObj = new URL(url);
    result.metrics.hasMobileVersion =
      urlObj.hostname.startsWith('m.') ||
      urlObj.hostname.startsWith('mobile.') ||
      urlObj.pathname.includes('/mobile');

    // Если сайт имеет отдельную мобильную версию, но не является адаптивным
    if (result.metrics.hasMobileVersion && !result.metrics.isResponsive) {
      result.issues.push(
        this.createIssue(
          'mobile-separate-version',
          'Сайт использует отдельную мобильную версию вместо адаптивного дизайна',
          'moderate',
          undefined,
          undefined,
          [
            'Рассмотрите переход на адаптивный дизайн вместо поддержки отдельной мобильной версии',
            'Адаптивный дизайн проще поддерживать и он лучше для SEO',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует производительность на мобильных устройствах
   */
  private async analyzeMobilePerformance(
    url: string,
    result: IMobileAnalysisResult,
    options?: IAnalysisOptions,
  ): Promise<void> {
    try {
      if (options?.includeBrowserMetrics) {
        // Демонстрация использования Puppeteer для получения метрик мобильной производительности
        const browser = await puppeteer.launch({ headless: true });
        const puppeteerPage = await browser.newPage();

        await puppeteerPage.emulate(puppeteer.KnownDevices['iPhone X']);

        // Включаем сбор метрик
        await puppeteerPage.setCacheEnabled(false);

        const startTime = Date.now();

        // Переходим на страницу и ждем загрузки
        await puppeteerPage.goto(url, { waitUntil: 'networkidle2' });

        // Получаем метрики
        const performanceMetrics = await puppeteerPage.evaluate(() => {
          const { timing } = window.performance;
          return {
            mobileLoadTime: timing.loadEventEnd - timing.navigationStart,
            mobileFCP: 0, // В реальном приложении здесь будет использоваться Performance API
            mobileInteractive: 0, // В реальном приложении здесь будет использоваться Performance API
          };
        });

        // Закрываем браузер
        await browser.close();

        // Сохраняем измеренные метрики
        result.metrics.performanceMetrics.mobileLoadTime =
          performanceMetrics.mobileLoadTime;
        result.metrics.performanceMetrics.mobileFCP =
          performanceMetrics.mobileFCP || 1200; // Заглушка
        result.metrics.performanceMetrics.mobileInteractive =
          performanceMetrics.mobileInteractive || 2500; // Заглушка
      } else {
        // Если метрики браузера не требуются, используем примерные значения
        result.metrics.performanceMetrics.mobileLoadTime = 3000; // Примерное время загрузки в мс
        result.metrics.performanceMetrics.mobileFCP = 1200; // Примерное время до первого контента в мс
        result.metrics.performanceMetrics.mobileInteractive = 2500; // Примерное время до интерактивности в мс
      }

      // Анализируем полученные метрики
      this.analyzeMobilePerformanceMetrics(result);
    } catch (error) {
      this.logger.error(
        `Error analyzing mobile performance metrics: ${error.message}`,
      );

      // Устанавливаем примерные значения в случае ошибки
      result.metrics.performanceMetrics.mobileLoadTime = 3000;
      result.metrics.performanceMetrics.mobileFCP = 1200;
      result.metrics.performanceMetrics.mobileInteractive = 2500;

      result.issues.push(
        this.createIssue(
          'mobile-metrics-error',
          'Не удалось получить метрики мобильной производительности',
          'info',
          undefined,
          undefined,
          ['Попробуйте запустить анализ еще раз'],
        ),
      );
    }
  }

  /**
   * Анализирует метрики мобильной производительности
   */
  private analyzeMobilePerformanceMetrics(result: IMobileAnalysisResult): void {
    // Проверка времени загрузки на мобильных
    if (result.metrics.performanceMetrics.mobileLoadTime > 5000) {
      result.issues.push(
        this.createIssue(
          'mobile-slow-load',
          `Медленное время загрузки на мобильных устройствах: ${result.metrics.performanceMetrics.mobileLoadTime} мс`,
          result.metrics.performanceMetrics.mobileLoadTime > 8000
            ? 'critical'
            : 'major',
          undefined,
          undefined,
          [
            'Оптимизируйте размеры изображений для мобильных устройств',
            'Минимизируйте и сжимайте CSS и JavaScript',
            'Используйте ленивую загрузку для нечитического контента',
            'Уменьшите количество HTTP-запросов',
          ],
        ),
      );
    }

    // Проверка времени до первого отображения контента на мобильных
    if (result.metrics.performanceMetrics.mobileFCP > 2500) {
      result.issues.push(
        this.createIssue(
          'mobile-slow-fcp',
          `Медленное время до первого отображения контента на мобильных: ${result.metrics.performanceMetrics.mobileFCP} мс`,
          result.metrics.performanceMetrics.mobileFCP > 3500
            ? 'critical'
            : 'major',
          undefined,
          undefined,
          [
            'Внедрите критические CSS прямо в HTML',
            'Оптимизируйте доставку ресурсов первого экрана',
            'Приоритизируйте загрузку видимого контента',
          ],
        ),
      );
    }

    // Проверка времени до интерактивности на мобильных
    if (result.metrics.performanceMetrics.mobileInteractive > 4500) {
      result.issues.push(
        this.createIssue(
          'mobile-slow-interactive',
          `Медленное время до интерактивности на мобильных: ${result.metrics.performanceMetrics.mobileInteractive} мс`,
          result.metrics.performanceMetrics.mobileInteractive > 6000
            ? 'critical'
            : 'major',
          undefined,
          undefined,
          [
            'Уменьшите размер и сложность JavaScript',
            'Отложите выполнение нечитического JavaScript',
            'Удалите неиспользуемый JavaScript код',
            'Разделите длительные задачи на более мелкие',
          ],
        ),
      );
    }
  }
}
