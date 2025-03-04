import { Injectable } from '@nestjs/common';
import * as https from 'https';
import { JSDOM } from 'jsdom';
import {
  IAnalysisOptions,
  IPageToAnalyze,
} from '../interfaces/analysis.interface';
import { ISecurityAnalysisResult } from '../interfaces/security-analysis.interface';
import { AbstractAnalyzer } from './abstract-analyzer';

@Injectable()
export class SecurityAnalyzer extends AbstractAnalyzer<ISecurityAnalysisResult> {
  constructor() {
    super('SecurityAnalyzer');
  }

  public getDescription(): string {
    return 'Анализирует безопасность веб-страницы, включая HTTPS, смешанный контент и заголовки безопасности';
  }

  protected async doAnalyze(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<ISecurityAnalysisResult> {
    const dom = new JSDOM(page.html, { url: page.url });
    const document = dom.window.document;

    // Инициализируем результат анализа
    const result: ISecurityAnalysisResult = {
      score: 0, // Будет рассчитано в postAnalysis
      issues: [],
      metrics: {
        usesHttps: page.url.startsWith('https://'),
        hasMixedContent: false, // Будет определено
        mixedContentItems: [],
        sslCertificate: {
          valid: false, // Будет определено
        },
        securityHeaders: {
          contentSecurityPolicy: false, // Будет определено
          xContentTypeOptions: false, // Будет определено
          xFrameOptions: false, // Будет определено
          xXssProtection: false, // Будет определено
          strictTransportSecurity: false, // Будет определено
          referrerPolicy: false, // Будет определено
          permissionsPolicy: false, // Будет определено
        },
        cookieSecurity: {
          hasCookies: false, // Будет определено
          secureCookies: 0, // Будет подсчитано
          httpOnlyCookies: 0, // Будет подсчитано
          sameSiteCookies: 0, // Будет подсчитано
          thirdPartyCookies: 0, // Будет подсчитано
        },
        vulnerabilities: {
          outdatedLibraries: 0, // Будет подсчитано
          knownVulnerabilities: [], // Будет заполнено
        },
      },
      timestamp: '',
    };

    // Анализируем различные аспекты безопасности
    await Promise.all([
      this.analyzeHttps(page.url, result),
      this.analyzeMixedContent(document, page.url, result),
      this.analyzeSecurityHeaders(page.url, result, options),
      this.analyzeCookies(document, page.url, result),
      this.analyzeJavaScriptLibraries(document, result),
    ]);

    return result;
  }

  /**
   * Анализирует использование HTTPS и SSL сертификат
   */
  private async analyzeHttps(
    url: string,
    result: ISecurityAnalysisResult,
  ): Promise<void> {
    // Проверяем использование HTTPS
    result.metrics.usesHttps = url.startsWith('https://');

    // В реальном проекте здесь будет проверка SSL сертификата
    if (result.metrics.usesHttps) {
      try {
        // Симуляция проверки сертификата
        // В реальном проекте здесь будет реальная проверка через https.request
        result.metrics.sslCertificate = {
          valid: true,
          issuer: "Let's Encrypt Authority X3",
          validFrom: new Date().toISOString(),
          validTo: new Date(
            Date.now() + 90 * 24 * 60 * 60 * 1000,
          ).toISOString(), // + 90 дней
          daysRemaining: 90,
        };
      } catch (error) {
        this.logger.error(`Error analyzing SSL certificate: ${error.message}`);
        result.metrics.sslCertificate = {
          valid: false,
        };
      }
    }

    // Анализируем результаты
    if (!result.metrics.usesHttps) {
      result.issues.push(
        this.createIssue(
          'security-no-https',
          'Сайт не использует HTTPS',
          'critical',
          undefined,
          undefined,
          [
            'Переведите сайт на HTTPS для защиты данных пользователей',
            'Настройте автоматический редирект с HTTP на HTTPS',
            "Получите SSL сертификат (например, бесплатный от Let's Encrypt)",
          ],
        ),
      );
    } else if (
      result.metrics.sslCertificate &&
      result.metrics.sslCertificate.daysRemaining !== undefined &&
      result.metrics.sslCertificate.daysRemaining < 30
    ) {
      result.issues.push(
        this.createIssue(
          'security-expiring-ssl',
          `SSL сертификат истекает через ${result.metrics.sslCertificate.daysRemaining} дней`,
          result.metrics.sslCertificate.daysRemaining < 14
            ? 'critical'
            : 'major',
          undefined,
          undefined,
          [
            'Обновите SSL сертификат до истечения срока действия',
            'Настройте автоматическое обновление сертификатов',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует наличие смешанного контента (HTTP на HTTPS странице)
   */
  private async analyzeMixedContent(
    document: Document,
    url: string,
    result: ISecurityAnalysisResult,
  ): Promise<void> {
    if (!result.metrics.usesHttps) {
      return; // Проверка смешанного контента имеет смысл только для HTTPS
    }

    const mixedContentItems: Array<{
      url: string;
      type: 'script' | 'style' | 'image' | 'font' | 'object' | 'other';
    }> = [];

    // Проверяем скрипты
    document.querySelectorAll('script[src]').forEach((script) => {
      const src = script.getAttribute('src');
      if (src && src.startsWith('http:')) {
        mixedContentItems.push({
          url: src,
          type: 'script',
        });
      }
    });

    // Проверяем стили
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('http:')) {
        mixedContentItems.push({
          url: href,
          type: 'style',
        });
      }
    });

    // Проверяем изображения
    document.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('http:')) {
        mixedContentItems.push({
          url: src,
          type: 'image',
        });
      }
    });

    // Проверяем шрифты
    document
      .querySelectorAll('link[rel="font"], link[rel="preload"][as="font"]')
      .forEach((link) => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('http:')) {
          mixedContentItems.push({
            url: href,
            type: 'font',
          });
        }
      });

    // Проверяем объекты (embed, object, iframe)
    document
      .querySelectorAll('embed[src], object[data], iframe[src]')
      .forEach((obj) => {
        const src = obj.getAttribute('src') || obj.getAttribute('data');
        if (src && src.startsWith('http:')) {
          mixedContentItems.push({
            url: src,
            type: 'object',
          });
        }
      });

    // Проверяем другие ресурсы (аудио, видео, и т.д.)
    document
      .querySelectorAll('audio[src], video[src], source[src]')
      .forEach((media) => {
        const src = media.getAttribute('src');
        if (src && src.startsWith('http:')) {
          mixedContentItems.push({
            url: src,
            type: 'other',
          });
        }
      });

    result.metrics.hasMixedContent = mixedContentItems.length > 0;
    result.metrics.mixedContentItems = mixedContentItems;

    // Анализируем результаты
    if (result.metrics.hasMixedContent) {
      const activeContentCount = mixedContentItems.filter((item) =>
        ['script', 'object'].includes(item.type),
      ).length;

      const severity = activeContentCount > 0 ? 'critical' : 'major';
      const message =
        activeContentCount > 0
          ? `Обнаружен активный смешанный контент (${activeContentCount} элементов), блокируемый современными браузерами`
          : `Обнаружен пассивный смешанный контент (${mixedContentItems.length} элементов)`;

      result.issues.push(
        this.createIssue(
          'security-mixed-content',
          message,
          severity,
          undefined,
          undefined,
          [
            'Замените все HTTP-ссылки на HTTPS или относительные пути',
            'Используйте протокол-относительные URL (начинающиеся с //)',
            'Добавьте заголовок Content-Security-Policy для блокировки смешанного контента',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует заголовки безопасности
   * Примечание: в реальном приложении используйте HTTP-запрос для получения заголовков
   */
  private async analyzeSecurityHeaders(
    url: string,
    result: ISecurityAnalysisResult,
    options?: IAnalysisOptions,
  ): Promise<void> {
    // В демонстрационных целях имитируем получение заголовков
    // В реальном проекте здесь будет https.request для получения настоящих заголовков

    if (options?.fetchHeaders) {
      try {
        const urlObj = new URL(url);

        await new Promise<void>((resolve, reject) => {
          const req = https.request(
            {
              hostname: urlObj.hostname,
              path: urlObj.pathname + urlObj.search,
              method: 'HEAD',
            },
            (res) => {
              // Анализируем заголовки ответа
              result.metrics.securityHeaders.contentSecurityPolicy =
                !!res.headers['content-security-policy'];

              result.metrics.securityHeaders.xContentTypeOptions =
                res.headers['x-content-type-options'] === 'nosniff';

              result.metrics.securityHeaders.xFrameOptions =
                !!res.headers['x-frame-options'];

              result.metrics.securityHeaders.xXssProtection =
                !!res.headers['x-xss-protection'];

              result.metrics.securityHeaders.strictTransportSecurity =
                !!res.headers['strict-transport-security'];

              result.metrics.securityHeaders.referrerPolicy =
                !!res.headers['referrer-policy'];

              result.metrics.securityHeaders.permissionsPolicy =
                !!res.headers['permissions-policy'];

              resolve();
            },
          );

          req.on('error', (e) => {
            reject(e);
          });

          req.end();
        });
      } catch (error) {
        this.logger.error(`Error fetching security headers: ${error.message}`);
        // В случае ошибки предполагаем, что заголовки отсутствуют
      }
    } else {
      // Симуляция для демонстрационных целей
      // Предполагаем, что базовые заголовки безопасности есть,
      // но продвинутые - отсутствуют
      result.metrics.securityHeaders.xContentTypeOptions = true;
      result.metrics.securityHeaders.xFrameOptions = true;
      result.metrics.securityHeaders.xXssProtection = true;
      result.metrics.securityHeaders.strictTransportSecurity =
        result.metrics.usesHttps;
      result.metrics.securityHeaders.contentSecurityPolicy = false;
      result.metrics.securityHeaders.referrerPolicy = false;
      result.metrics.securityHeaders.permissionsPolicy = false;
    }

    // Анализируем результаты
    const missingHeaders: string[] = [];

    if (!result.metrics.securityHeaders.contentSecurityPolicy) {
      missingHeaders.push('Content-Security-Policy');
    }

    if (!result.metrics.securityHeaders.xContentTypeOptions) {
      missingHeaders.push('X-Content-Type-Options');
    }

    if (!result.metrics.securityHeaders.xFrameOptions) {
      missingHeaders.push('X-Frame-Options');
    }

    if (!result.metrics.securityHeaders.xXssProtection) {
      missingHeaders.push('X-XSS-Protection');
    }

    if (
      result.metrics.usesHttps &&
      !result.metrics.securityHeaders.strictTransportSecurity
    ) {
      missingHeaders.push('Strict-Transport-Security');
    }

    if (!result.metrics.securityHeaders.referrerPolicy) {
      missingHeaders.push('Referrer-Policy');
    }

    if (!result.metrics.securityHeaders.permissionsPolicy) {
      missingHeaders.push('Permissions-Policy');
    }

    if (missingHeaders.length > 0) {
      result.issues.push(
        this.createIssue(
          'security-missing-headers',
          `Отсутствуют важные заголовки безопасности: ${missingHeaders.join(', ')}`,
          missingHeaders.includes('Content-Security-Policy')
            ? 'critical'
            : 'major',
          undefined,
          undefined,
          [
            'Добавьте отсутствующие заголовки безопасности на сервере',
            'Content-Security-Policy защищает от XSS и инъекций',
            'Strict-Transport-Security принудительно использует HTTPS',
            'X-Content-Type-Options предотвращает MIME-сниффинг',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует безопасность cookies
   */
  private async analyzeCookies(
    document: Document,
    url: string,
    result: ISecurityAnalysisResult,
  ): Promise<void> {
    // В реальном приложении здесь будет анализ через puppeteer или другие средства
    // В демонстрационных целях имитируем анализ cookies

    // Симуляция cookies для демонстрационных целей
    const cookies = [
      {
        name: 'session',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
        domain: new URL(url).hostname,
      },
      {
        name: 'preferences',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax',
        domain: new URL(url).hostname,
      },
      {
        name: '_ga',
        secure: false,
        httpOnly: false,
        sameSite: null,
        domain: 'google-analytics.com',
      },
      {
        name: '_fbp',
        secure: false,
        httpOnly: false,
        sameSite: null,
        domain: 'facebook.com',
      },
    ];

    result.metrics.cookieSecurity.hasCookies = cookies.length > 0;

    // Подсчитываем характеристики cookies
    cookies.forEach((cookie) => {
      if (cookie.secure) {
        result.metrics.cookieSecurity.secureCookies++;
      }

      if (cookie.httpOnly) {
        result.metrics.cookieSecurity.httpOnlyCookies++;
      }

      if (cookie.sameSite) {
        result.metrics.cookieSecurity.sameSiteCookies++;
      }

      if (cookie.domain !== new URL(url).hostname) {
        result.metrics.cookieSecurity.thirdPartyCookies++;
      }
    });

    // Анализируем результаты
    if (result.metrics.cookieSecurity.hasCookies) {
      if (
        result.metrics.usesHttps &&
        result.metrics.cookieSecurity.secureCookies < cookies.length
      ) {
        result.issues.push(
          this.createIssue(
            'security-cookies-no-secure',
            'Не все cookies имеют флаг Secure на HTTPS-сайте',
            'major',
            undefined,
            undefined,
            [
              'Добавьте флаг Secure для всех cookies на HTTPS-сайте',
              'Secure cookies передаются только по HTTPS-соединениям',
            ],
          ),
        );
      }

      if (result.metrics.cookieSecurity.httpOnlyCookies < cookies.length) {
        result.issues.push(
          this.createIssue(
            'security-cookies-no-httponly',
            'Не все cookies имеют флаг HttpOnly',
            'moderate',
            undefined,
            undefined,
            [
              'Добавьте флаг HttpOnly для cookies, которые не требуются в JavaScript',
              'HttpOnly cookies недоступны для JavaScript, что защищает от XSS',
            ],
          ),
        );
      }

      if (result.metrics.cookieSecurity.sameSiteCookies < cookies.length) {
        result.issues.push(
          this.createIssue(
            'security-cookies-no-samesite',
            'Не все cookies имеют атрибут SameSite',
            'moderate',
            undefined,
            undefined,
            [
              'Добавьте атрибут SameSite=Lax или SameSite=Strict для cookies',
              'SameSite cookies защищают от CSRF-атак',
            ],
          ),
        );
      }
    }
  }

  /**
   * Анализирует JavaScript библиотеки на наличие уязвимостей
   */
  private async analyzeJavaScriptLibraries(
    document: Document,
    result: ISecurityAnalysisResult,
  ): Promise<void> {
    // Извлекаем JavaScript библиотеки
    const libraries: Record<string, string> = {};

    // Ищем встроенные библиотеки и их версии
    document.querySelectorAll('script').forEach((script) => {
      const src = script.getAttribute('src');
      if (!src) return;

      // Извлекаем названия и версии библиотек из URL скриптов
      this.extractLibraryInfo(src, libraries);
    });

    // В реальном проекте здесь будет проверка версий на известные уязвимости
    // через API базы данных уязвимостей (например, Snyk или NPM Audit)

    // Симуляция устаревших библиотек с уязвимостями
    const outdatedLibraries: string[] = [];
    const knownVulnerabilities: Array<{
      library: string;
      version: string;
      severity: 'low' | 'medium' | 'high';
      description: string;
    }> = [];

    if (
      libraries['jquery'] &&
      this.compareVersions(libraries['jquery'], '3.4.0') < 0
    ) {
      outdatedLibraries.push('jquery');
      knownVulnerabilities.push({
        library: 'jquery',
        version: libraries['jquery'],
        severity: 'high',
        description: 'Versions before 3.4.0 vulnerable to XSS attacks',
      });
    }

    if (
      libraries['bootstrap'] &&
      this.compareVersions(libraries['bootstrap'], '4.3.1') < 0
    ) {
      outdatedLibraries.push('bootstrap');
      knownVulnerabilities.push({
        library: 'bootstrap',
        version: libraries['bootstrap'],
        severity: 'medium',
        description: 'Versions before 4.3.1 vulnerable to XSS attacks',
      });
    }

    result.metrics.vulnerabilities.outdatedLibraries = outdatedLibraries.length;
    result.metrics.vulnerabilities.knownVulnerabilities = knownVulnerabilities;

    // Анализируем результаты
    if (outdatedLibraries.length > 0) {
      result.issues.push(
        this.createIssue(
          'security-outdated-libraries',
          `Обнаружены устаревшие JavaScript библиотеки с известными уязвимостями: ${outdatedLibraries.join(', ')}`,
          'critical',
          undefined,
          undefined,
          [
            'Обновите JavaScript библиотеки до последних версий',
            'Регулярно проверяйте зависимости на наличие уязвимостей',
            'Используйте инструменты аудита безопасности в процессе разработки',
          ],
        ),
      );
    }
  }

  /**
   * Извлекает информацию о библиотеке из URL скрипта
   */
  private extractLibraryInfo(
    src: string,
    libraries: Record<string, string>,
  ): void {
    // Извлекаем названия и версии популярных библиотек из URL
    const libPatterns = [
      { name: 'jquery', pattern: /jquery[.-]([0-9\.]+)(\.min)?\.js$/i },
      { name: 'bootstrap', pattern: /bootstrap[.-]([0-9\.]+)(\.min)?\.js$/i },
      { name: 'react', pattern: /react[.-]([0-9\.]+)(\.min)?\.js$/i },
      { name: 'angular', pattern: /angular[.-]([0-9\.]+)(\.min)?\.js$/i },
      { name: 'vue', pattern: /vue[.-]([0-9\.]+)(\.min)?\.js$/i },
      { name: 'lodash', pattern: /lodash[.-]([0-9\.]+)(\.min)?\.js$/i },
    ];

    for (const lib of libPatterns) {
      const match = src.match(lib.pattern);
      if (match && match[1]) {
        libraries[lib.name] = match[1];
        break;
      }
    }
  }

  /**
   * Сравнивает версии по принципу семантического версионирования
   * @returns отрицательное число, если v1 < v2, положительное, если v1 > v2, 0 если v1 = v2
   */
  private compareVersions(v1: string, v2: string): number {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }

    return 0;
  }
}
