import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import * as puppeteer from 'puppeteer';
import {
  IAnalysisOptions,
  IPageToAnalyze,
} from '../interfaces/analysis.interface';
import { IPerformanceAnalysisResult } from '../interfaces/performance-analysis.interface';
import { AbstractAnalyzer } from './abstract-analyzer';

@Injectable()
export class PerformanceAnalyzer extends AbstractAnalyzer<IPerformanceAnalysisResult> {
  constructor() {
    super('PerformanceAnalyzer');
  }

  public getDescription(): string {
    return 'Анализирует производительность страницы, включая время загрузки, размеры ресурсов и запросы';
  }

  protected async doAnalyze(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<IPerformanceAnalysisResult> {
    const dom = new JSDOM(page.html);
    const document = dom.window.document;

    // Инициализируем результат анализа
    const result: IPerformanceAnalysisResult = {
      score: 0, // Будет рассчитано в postAnalysis
      issues: [],
      metrics: {
        pageLoadTime: 0,
        firstContentfulPaint: 0,
        timeToInteractive: 0,
        htmlSize: page.html.length,
        cssSize: 0,
        jsSize: 0,
        totalImageSize: 0,
        imageCount: 0,
        requestCount: 0,
        requestTypes: {
          html: 1, // Минимум один HTML запрос (сама страница)
          css: 0,
          js: 0,
          image: 0,
          font: 0,
          other: 0,
        },
        serverResponseTime: 0,
        serverErrors: {},
        cachingHeaders: {},
        usesCDN: false,
      },
      timestamp: '',
    };

    // Анализируем различные аспекты производительности
    await Promise.all([
      this.analyzeResourceSizes(document, result),
      this.analyzeRequests(document, result),
      this.analyzeBrowserMetrics(page.url, result, options),
    ]);

    return result;
  }

  /**
   * Анализирует размеры ресурсов на странице
   */
  private async analyzeResourceSizes(
    document: Document,
    result: IPerformanceAnalysisResult,
  ): Promise<void> {
    // Анализ CSS-файлов
    const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
    result.metrics.requestTypes.css = cssLinks.length;

    // В реальном приложении здесь будет расчет фактических размеров каждого CSS файла
    result.metrics.cssSize = cssLinks.length * 15000; // Примерный размер в байтах

    // Анализ JavaScript-файлов
    const scripts = document.querySelectorAll('script[src]');
    result.metrics.requestTypes.js = scripts.length;

    // В реальном приложении здесь будет расчет фактических размеров каждого JS файла
    result.metrics.jsSize = scripts.length * 50000; // Примерный размер в байтах

    // Анализ изображений
    const images = document.querySelectorAll('img[src]');
    result.metrics.imageCount = images.length;
    result.metrics.requestTypes.image = images.length;

    // В реальном приложении здесь будет расчет фактических размеров каждого изображения
    result.metrics.totalImageSize = images.length * 100000; // Примерный размер в байтах

    // Анализ шрифтов
    const fontFaceRules = document.querySelectorAll('style');
    // В реальном приложении здесь будет поиск @font-face в стилях и подсчет шрифтов
    result.metrics.requestTypes.font = fontFaceRules.length; // Упрощенно

    // Подсчет общего количества запросов
    result.metrics.requestCount =
      1 + // HTML
      result.metrics.requestTypes.css +
      result.metrics.requestTypes.js +
      result.metrics.requestTypes.image +
      result.metrics.requestTypes.font +
      result.metrics.requestTypes.other;

    // Проверка размера HTML
    if (result.metrics.htmlSize > 100000) {
      // Больше 100KB
      result.issues.push(
        this.createIssue(
          'perf-html-too-large',
          `Размер HTML слишком большой: ${(result.metrics.htmlSize / 1024).toFixed(2)} KB`,
          'moderate',
          undefined,
          undefined,
          [
            'Уменьшите размер HTML-документа',
            'Удалите ненужные комментарии и пробелы',
            'Используйте GZIP-сжатие на сервере',
          ],
        ),
      );
    }

    // Проверка размера CSS
    if (result.metrics.cssSize > 150000) {
      // Больше 150KB
      result.issues.push(
        this.createIssue(
          'perf-css-too-large',
          `Общий размер CSS слишком большой: ${(result.metrics.cssSize / 1024).toFixed(2)} KB`,
          'moderate',
          undefined,
          undefined,
          [
            'Минифицируйте CSS-файлы',
            'Объедините несколько CSS-файлов в один',
            'Удалите неиспользуемые стили',
            'Рассмотрите возможность использования CSS-фреймворка с меньшим размером',
          ],
        ),
      );
    }

    // Проверка размера JavaScript
    if (result.metrics.jsSize > 300000) {
      // Больше 300KB
      result.issues.push(
        this.createIssue(
          'perf-js-too-large',
          `Общий размер JavaScript слишком большой: ${(result.metrics.jsSize / 1024).toFixed(2)} KB`,
          'major',
          undefined,
          undefined,
          [
            'Минифицируйте JavaScript-файлы',
            'Используйте ленивую загрузку для скриптов',
            'Разделите код на чанки для асинхронной загрузки',
            'Удалите неиспользуемый код',
          ],
        ),
      );
    }

    // Проверка количества изображений
    if (result.metrics.imageCount > 15) {
      // Большое количество изображений
      result.issues.push(
        this.createIssue(
          'perf-too-many-images',
          `Слишком много изображений на странице: ${result.metrics.imageCount}`,
          'moderate',
          undefined,
          undefined,
          [
            'Уменьшите количество изображений на странице',
            'Используйте ленивую загрузку для изображений',
            'Рассмотрите возможность использования CSS вместо изображений для простых элементов',
          ],
        ),
      );
    }

    // Проверка общего размера изображений
    if (result.metrics.totalImageSize > 1000000) {
      // Больше 1MB
      result.issues.push(
        this.createIssue(
          'perf-images-too-large',
          `Общий размер изображений слишком большой: ${(result.metrics.totalImageSize / 1024 / 1024).toFixed(2)} MB`,
          'major',
          undefined,
          undefined,
          [
            'Оптимизируйте изображения для уменьшения их размера',
            'Используйте WebP формат вместо PNG/JPEG',
            'Уменьшите физические размеры изображений',
            'Используйте адаптивные изображения с помощью srcset',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует HTTP-запросы на странице
   */
  private async analyzeRequests(
    document: Document,
    result: IPerformanceAnalysisResult,
  ): Promise<void> {
    // В реальном приложении здесь будет анализ фактических HTTP-запросов
    // с использованием puppeteer или аналогичного инструмента

    // Проверка количества запросов
    if (result.metrics.requestCount > 50) {
      result.issues.push(
        this.createIssue(
          'perf-too-many-requests',
          `Слишком много HTTP-запросов: ${result.metrics.requestCount}`,
          'major',
          undefined,
          undefined,
          [
            'Объедините мелкие JavaScript и CSS файлы',
            'Используйте спрайты для мелких изображений',
            'Объедините мелкие API-запросы',
            'Внедрите критические CSS прямо в HTML',
          ],
        ),
      );
    }

    // Проверка использования CDN (упрощенная)
    const externalHosts = new Set<string>();

    // Проверяем хосты для скриптов
    document.querySelectorAll('script[src]').forEach((script) => {
      const src = script.getAttribute('src');
      if (src && src.startsWith('http')) {
        try {
          const url = new URL(src);
          externalHosts.add(url.hostname);
        } catch (error) {
          // Игнорируем некорректные URL
        }
      }
    });

    // Проверяем хосты для стилей
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('http')) {
        try {
          const url = new URL(href);
          externalHosts.add(url.hostname);
        } catch (error) {
          // Игнорируем некорректные URL
        }
      }
    });

    // Проверяем хосты для изображений
    document.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('http')) {
        try {
          const url = new URL(src);
          externalHosts.add(url.hostname);
        } catch (error) {
          // Игнорируем некорректные URL
        }
      }
    });

    // Проверяем, есть ли хосты, похожие на CDN
    const cdnPatterns = [
      'cdn',
      'cloudfront',
      'akamai',
      'cloudflare',
      'fastly',
      'jsdelivr',
      'unpkg',
      'staticfiles',
      'assets',
      'static',
    ];

    for (const host of externalHosts) {
      if (cdnPatterns.some((pattern) => host.includes(pattern))) {
        result.metrics.usesCDN = true;
        break;
      }
    }

    if (!result.metrics.usesCDN && externalHosts.size > 5) {
      result.issues.push(
        this.createIssue(
          'perf-no-cdn',
          'Ресурсы загружаются с нескольких доменов, но не используется CDN',
          'moderate',
          undefined,
          undefined,
          [
            'Используйте CDN для доставки статических ресурсов',
            'Размещайте ресурсы на поддоменах для улучшения производительности',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует метрики браузера
   */
  private async analyzeBrowserMetrics(
    url: string,
    result: IPerformanceAnalysisResult,
    options?: IAnalysisOptions,
  ): Promise<void> {
    // В реальном приложении здесь будет использоваться Puppeteer или Lighthouse API
    // для измерения реальных метрик производительности

    try {
      if (options?.includeBrowserMetrics) {
        // Демонстрация использования Puppeteer для получения метрик
        const browser = await puppeteer.launch({ headless: true });
        const puppeteerPage = await browser.newPage();

        // Включаем сбор метрик
        await puppeteerPage.setCacheEnabled(false);
        await puppeteerPage.setRequestInterception(true);

        const startTime = Date.now();
        let serverResponseTime = 0;

        // Обрабатываем запросы для отслеживания ответов сервера
        puppeteerPage.on('request', (request) => {
          request.continue();
        });

        puppeteerPage.on('response', (response) => {
          if (response.url() === url) {
            serverResponseTime = Date.now() - startTime;
          }
        });

        // Переходим на страницу и ждем загрузки
        await puppeteerPage.goto(url, { waitUntil: 'networkidle2' });

        // Получаем метрики
        const performanceMetrics = await puppeteerPage.evaluate(() => {
          const { timing } = window.performance;
          return {
            pageLoadTime: timing.loadEventEnd - timing.navigationStart,
            firstContentfulPaint: 0, // В реальном приложении здесь будет использоваться Performance API
            timeToInteractive: 0, // В реальном приложении здесь будет использоваться Performance API
          };
        });

        // Закрываем браузер
        await browser.close();

        // Сохраняем измеренные метрики
        result.metrics.pageLoadTime = performanceMetrics.pageLoadTime;
        result.metrics.firstContentfulPaint =
          performanceMetrics.firstContentfulPaint || 1000; // Заглушка
        result.metrics.timeToInteractive =
          performanceMetrics.timeToInteractive || 2000; // Заглушка
        result.metrics.serverResponseTime = serverResponseTime;
      } else {
        // Если метрики браузера не требуются, используем примерные значения
        result.metrics.pageLoadTime = 2500; // Примерное время загрузки в мс
        result.metrics.firstContentfulPaint = 1000; // Примерное время до первого контента в мс
        result.metrics.timeToInteractive = 2000; // Примерное время до интерактивности в мс
        result.metrics.serverResponseTime = 300; // Примерное время ответа сервера в мс
      }

      // Анализируем полученные метрики
      this.analyzeTimingMetrics(result);
    } catch (error) {
      this.logger.error(`Error analyzing browser metrics: ${error.message}`);

      // Устанавливаем примерные значения в случае ошибки
      result.metrics.pageLoadTime = 2500;
      result.metrics.firstContentfulPaint = 1000;
      result.metrics.timeToInteractive = 2000;
      result.metrics.serverResponseTime = 300;

      result.issues.push(
        this.createIssue(
          'perf-metrics-error',
          'Не удалось получить метрики производительности',
          'info',
          undefined,
          undefined,
          ['Попробуйте запустить анализ еще раз'],
        ),
      );
    }
  }

  /**
   * Анализирует метрики времени загрузки
   */
  private analyzeTimingMetrics(result: IPerformanceAnalysisResult): void {
    // Проверка времени ответа сервера
    if (result.metrics.serverResponseTime > 500) {
      result.issues.push(
        this.createIssue(
          'perf-server-response-slow',
          `Медленное время ответа сервера: ${result.metrics.serverResponseTime} мс`,
          result.metrics.serverResponseTime > 1000 ? 'critical' : 'major',
          undefined,
          undefined,
          [
            'Оптимизируйте серверный код',
            'Используйте кэширование на сервере',
            'Рассмотрите возможность использования CDN',
            'Проверьте настройки сервера и базы данных',
          ],
        ),
      );
    }

    // Проверка времени до первого отображения контента
    if (result.metrics.firstContentfulPaint > 2000) {
      result.issues.push(
        this.createIssue(
          'perf-fcp-slow',
          `Медленное время до первого отображения контента: ${result.metrics.firstContentfulPaint} мс`,
          result.metrics.firstContentfulPaint > 3000 ? 'critical' : 'major',
          undefined,
          undefined,
          [
            'Внедрите критические CSS прямо в HTML',
            'Уменьшите размер страницы',
            'Отложите загрузку нечитического JavaScript',
            'Оптимизируйте порядок загрузки ресурсов',
          ],
        ),
      );
    }

    // Проверка времени до интерактивности
    if (result.metrics.timeToInteractive > 3500) {
      result.issues.push(
        this.createIssue(
          'perf-tti-slow',
          `Медленное время до интерактивности: ${result.metrics.timeToInteractive} мс`,
          result.metrics.timeToInteractive > 5000 ? 'critical' : 'major',
          undefined,
          undefined,
          [
            'Уменьшите размер и сложность JavaScript',
            'Разделите длительные задачи на более мелкие',
            'Используйте Web Workers для тяжелых вычислений',
            'Отложите нечитический JavaScript до момента интерактивности',
          ],
        ),
      );
    }

    // Проверка общего времени загрузки страницы
    if (result.metrics.pageLoadTime > 4000) {
      result.issues.push(
        this.createIssue(
          'perf-load-slow',
          `Медленное время загрузки страницы: ${result.metrics.pageLoadTime} мс`,
          result.metrics.pageLoadTime > 6000 ? 'critical' : 'major',
          undefined,
          undefined,
          [
            'Оптимизируйте размер ресурсов',
            'Уменьшите количество HTTP-запросов',
            'Используйте ленивую загрузку для нечитичных ресурсов',
            'Используйте предварительную загрузку для критических ресурсов',
          ],
        ),
      );
    }
  }
}
