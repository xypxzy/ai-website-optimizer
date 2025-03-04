import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PerformanceAnalyzer } from './analyzers/performance-analyzer';
import { SeoAnalyzer } from './analyzers/seo-analyzer';
import {
  IAnalysisOptions,
  IAnalysisResult,
  IPageToAnalyze,
} from './interfaces/analysis.interface';
import { IAnalyzer } from './interfaces/analyzer.interface';
import { IPerformanceAnalysisResult } from './interfaces/performance-analysis.interface';
import { ISeoAnalysisResult } from './interfaces/seo-analysis.interface';

/**
 * Результат комплексного технического анализа
 */
export interface ITechnicalAnalysisResult {
  url: string;
  timestamp: string;
  overallScore: number;
  analyzers: {
    [key: string]: IAnalysisResult;
  };
  summary: {
    criticalIssuesCount: number;
    majorIssuesCount: number;
    moderateIssuesCount: number;
    minorIssuesCount: number;
    infoIssuesCount: number;
    totalIssuesCount: number;
  };
}

@Injectable()
export class TechnicalAnalysisService {
  private readonly logger = new Logger(TechnicalAnalysisService.name);
  private readonly analyzers: IAnalyzer<IAnalysisResult>[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly seoAnalyzer: SeoAnalyzer,
    private readonly performanceAnalyzer: PerformanceAnalyzer,
    // В реальном проекте здесь будут другие анализаторы:
    // private readonly linkAnalyzer: LinkAnalyzer,
    // private readonly mobileAnalyzer: MobileAnalyzer,
    // private readonly contentAnalyzer: ContentAnalyzer,
    // private readonly securityAnalyzer: SecurityAnalyzer,
  ) {
    // Регистрируем все анализаторы
    this.analyzers.push(seoAnalyzer);
    this.analyzers.push(performanceAnalyzer);
    // this.analyzers.push(linkAnalyzer);
    // this.analyzers.push(mobileAnalyzer);
    // this.analyzers.push(contentAnalyzer);
    // this.analyzers.push(securityAnalyzer);
  }

  public async runTechnicalAnalysisForScan(scanId: string): Promise<void> {
    const scan = await this.prisma.pageScan.findUnique({
      where: { id: scanId },
    });

    if (!scan || !scan.htmlSnapshot) {
      throw new NotFoundException('Scan not found or HTML snapshot is missing');
    }

    // Запускаем технический анализ
    await this.analyzePage(
      {
        url: scan.url,
        html: scan.htmlSnapshot,
        screenshot: scan.screenshotUrl ?? undefined,
      },
      undefined, // опции анализа
      scanId, // передаем ID сканирования
    );
  }

  /**
   * Выполняет комплексный технический анализ страницы
   * @param page Страница для анализа
   * @param options Опции для анализа
   */
  public async analyzePage(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
    scanId?: string,
  ): Promise<ITechnicalAnalysisResult> {
    this.logger.log(`Starting technical analysis for ${page.url}`);

    const result: ITechnicalAnalysisResult = {
      url: page.url,
      timestamp: new Date().toISOString(),
      overallScore: 0,
      analyzers: {},
      summary: {
        criticalIssuesCount: 0,
        majorIssuesCount: 0,
        moderateIssuesCount: 0,
        minorIssuesCount: 0,
        infoIssuesCount: 0,
        totalIssuesCount: 0,
      },
    };

    try {
      // Запускаем все анализаторы параллельно
      const analysisPromises = this.analyzers.map((analyzer) => {
        return analyzer
          .analyze(page, options)
          .then((analysisResult) => {
            // Сохраняем результат анализа
            result.analyzers[analyzer.getName()] = analysisResult;
            return analysisResult;
          })
          .catch((error) => {
            this.logger.error(
              `Error in ${analyzer.getName()}: ${error.message}`,
              error.stack,
            );
            // Возвращаем пустой результат в случае ошибки
            return {
              score: 0,
              issues: [
                {
                  code: 'analyzer-error',
                  message: `Ошибка в анализаторе: ${error.message}`,
                  severity: 'info',
                },
              ],
              metrics: {},
              timestamp: new Date().toISOString(),
            } as IAnalysisResult;
          });
      });

      // Ждем завершения всех анализаторов
      await Promise.all(analysisPromises);

      // Вычисляем общую оценку и статистику проблем
      this.calculateOverallScore(result);
      this.calculateIssuesSummary(result);

      // Сохраняем результаты анализа в базу данных
      await this.saveAnalysisResults(page, result, scanId);

      this.logger.log(
        `Technical analysis completed for ${page.url} with overall score: ${result.overallScore}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error during technical analysis for ${page.url}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Получает результаты анализа из базы данных
   * @param scanId ID сканирования
   */
  public async getAnalysisResults(
    scanId: string,
  ): Promise<ITechnicalAnalysisResult | null> {
    try {
      // Получаем данные из базы
      const pageScan = await this.prisma.pageScan.findUnique({
        where: { id: scanId },
        include: {
          seoAnalysis: true,
          technicalAnalysis: true,
          linkAnalysis: true,
          mobileAnalysis: true,
          contentAnalysis: true,
          securityAnalysis: true,
        },
      });

      if (!pageScan) {
        return null;
      }

      // Преобразуем данные из базы в формат ITechnicalAnalysisResult
      // В реальном проекте здесь будет более сложная логика

      const result: ITechnicalAnalysisResult = {
        url: pageScan.url,
        timestamp:
          pageScan.completedAt?.toISOString() || new Date().toISOString(),
        overallScore: 0,
        analyzers: {},
        summary: {
          criticalIssuesCount: 0,
          majorIssuesCount: 0,
          moderateIssuesCount: 0,
          minorIssuesCount: 0,
          infoIssuesCount: 0,
          totalIssuesCount: 0,
        },
      };

      // Заполняем данные по SEO
      if (pageScan.seoAnalysis) {
        const seoData = pageScan.seoAnalysis;

        result.analyzers['SeoAnalyzer'] = {
          score: 0, // Рассчитаем позже
          issues: [], // Получим из метаданных
          metrics: {
            hasTitle: seoData.hasTitle,
            hasDescription: seoData.hasDescription,
            titleLength: seoData.titleLength || 0,
            descriptionLength: seoData.descriptionLength || 0,
            headingsStructure: seoData.headingsStructure as any,
            textToHtmlRatio: seoData.textToHtmlRatio,
            keywordDensity: seoData.keywordDensity as any,
            hasDuplicateContent: seoData.hasDuplicateContent,
            hasCanonicalUrl: seoData.hasCanonicalUrl,
            hasSitemap: seoData.hasSitemap,
            hasRobotsTxt: seoData.hasRobotsTxt,
            schemaOrgData: seoData.schemaOrgData as any,
          },
          timestamp: seoData.createdAt.toISOString(),
        } as ISeoAnalysisResult;
      }

      // Заполняем данные по производительности
      if (pageScan.technicalAnalysis) {
        const perfData = pageScan.technicalAnalysis;

        result.analyzers['PerformanceAnalyzer'] = {
          score: 0, // Рассчитаем позже
          issues: [], // Получим из метаданных
          metrics: {
            pageLoadTime: perfData.pageLoadTime,
            firstContentfulPaint: perfData.firstContentfulPaint,
            timeToInteractive: perfData.timeToInteractive,
            htmlSize: perfData.htmlSize,
            cssSize: perfData.cssSize,
            jsSize: perfData.jsSize,
            totalImageSize: perfData.totalImageSize,
            imageCount: perfData.imageCount,
            requestCount: perfData.requestCount,
            requestTypes: perfData.requestTypes as any,
            serverResponseTime: perfData.serverResponseTime,
            serverErrors: perfData.serverErrors as any,
            cachingHeaders: perfData.cachingHeaders as any,
            usesCDN: perfData.usesCDN,
          },
          timestamp: perfData.createdAt.toISOString(),
        } as IPerformanceAnalysisResult;
      }

      // В реальном проекте здесь будут добавлены и другие анализаторы

      // Вычисляем общую оценку и статистику проблем
      this.calculateOverallScore(result);

      return result;
    } catch (error) {
      this.logger.error(
        `Error getting analysis results for scan ${scanId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Сохраняет результаты анализа в базу данных
   * @param page Страница
   * @param result Результат анализа
   * @param scanId ID сканирования (если известен)
   */
  private async saveAnalysisResults(
    page: IPageToAnalyze,
    result: ITechnicalAnalysisResult,
    scanId?: string,
  ): Promise<void> {
    try {
      // Находим запись сканирования по ID (если передан) или по URL
      let pageScan;
      if (scanId) {
        pageScan = await this.prisma.pageScan.findUnique({
          where: { id: scanId },
        });
      } else {
        pageScan = await this.prisma.pageScan.findFirst({
          where: { url: page.url },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!pageScan) {
        this.logger.warn(`Page scan not found for URL: ${page.url}`);
        return;
      }

      // Используем транзакцию для атомарного сохранения всех результатов
      await this.prisma.$transaction(async (tx) => {
        // Сохраняем результаты SEO-анализа
        const seoResult = result.analyzers['SeoAnalyzer'] as ISeoAnalysisResult;
        if (seoResult) {
          await tx.sEOAnalysis.upsert({
            where: { pageScanId: pageScan.id },
            update: {
              hasTitle: seoResult.metrics.hasTitle,
              hasDescription: seoResult.metrics.hasDescription,
              titleLength: seoResult.metrics.titleLength || null,
              descriptionLength: seoResult.metrics.descriptionLength || null,
              headingsStructure: seoResult.metrics.headingsStructure,
              textToHtmlRatio: seoResult.metrics.textToHtmlRatio,
              keywordDensity: seoResult.metrics.keywordDensity,
              hasDuplicateContent: seoResult.metrics.hasDuplicateContent,
              hasCanonicalUrl: seoResult.metrics.hasCanonicalUrl,
              hasSitemap: seoResult.metrics.hasSitemap,
              hasRobotsTxt: seoResult.metrics.hasRobotsTxt,
              metaTagsIssues:
                this.filterIssuesByPrefix(seoResult.issues, 'seo-meta') || null,
              headingsIssues:
                this.filterIssuesByPrefix(seoResult.issues, 'seo-heading') ||
                null,
            },
            create: {
              pageScanId: pageScan.id,
              hasTitle: seoResult.metrics.hasTitle,
              hasDescription: seoResult.metrics.hasDescription,
              titleLength: seoResult.metrics.titleLength || null,
              descriptionLength: seoResult.metrics.descriptionLength || null,
              headingsStructure: seoResult.metrics.headingsStructure,
              textToHtmlRatio: seoResult.metrics.textToHtmlRatio,
              keywordDensity: seoResult.metrics.keywordDensity,
              hasDuplicateContent: seoResult.metrics.hasDuplicateContent,
              hasCanonicalUrl: seoResult.metrics.hasCanonicalUrl,
              hasSitemap: seoResult.metrics.hasSitemap,
              hasRobotsTxt: seoResult.metrics.hasRobotsTxt,
              metaTagsIssues:
                this.filterIssuesByPrefix(seoResult.issues, 'seo-meta') || null,
              headingsIssues:
                this.filterIssuesByPrefix(seoResult.issues, 'seo-heading') ||
                null,
            },
          });
        }

        // Сохраняем результаты анализа производительности
        const perfResult = result.analyzers[
          'PerformanceAnalyzer'
        ] as IPerformanceAnalysisResult;
        if (perfResult) {
          await tx.technicalAnalysis.upsert({
            where: { pageScanId: pageScan.id },
            update: {
              pageLoadTime: perfResult.metrics.pageLoadTime,
              firstContentfulPaint: perfResult.metrics.firstContentfulPaint,
              timeToInteractive: perfResult.metrics.timeToInteractive,
              htmlSize: perfResult.metrics.htmlSize,
              cssSize: perfResult.metrics.cssSize,
              jsSize: perfResult.metrics.jsSize,
              totalImageSize: perfResult.metrics.totalImageSize,
              imageCount: perfResult.metrics.imageCount,
              requestCount: perfResult.metrics.requestCount,
              requestTypes: perfResult.metrics.requestTypes,
              serverResponseTime: perfResult.metrics.serverResponseTime,
              serverErrors: perfResult.metrics.serverErrors || null,
              cachingHeaders: perfResult.metrics.cachingHeaders || null,
              usesCDN: perfResult.metrics.usesCDN,
              performanceIssues:
                this.filterIssuesByPrefix(perfResult.issues, 'perf') || null,
            },
            create: {
              pageScanId: pageScan.id,
              pageLoadTime: perfResult.metrics.pageLoadTime,
              firstContentfulPaint: perfResult.metrics.firstContentfulPaint,
              timeToInteractive: perfResult.metrics.timeToInteractive,
              htmlSize: perfResult.metrics.htmlSize,
              cssSize: perfResult.metrics.cssSize,
              jsSize: perfResult.metrics.jsSize,
              totalImageSize: perfResult.metrics.totalImageSize,
              imageCount: perfResult.metrics.imageCount,
              requestCount: perfResult.metrics.requestCount,
              requestTypes: perfResult.metrics.requestTypes,
              serverResponseTime: perfResult.metrics.serverResponseTime,
              serverErrors: perfResult.metrics.serverErrors || null,
              cachingHeaders: perfResult.metrics.cachingHeaders || null,
              usesCDN: perfResult.metrics.usesCDN,
              performanceIssues:
                this.filterIssuesByPrefix(perfResult.issues, 'perf') || null,
            },
          });
        }

        // Обновляем статус сканирования, если он не завершен
        if (pageScan.status !== 'completed') {
          await tx.pageScan.update({
            where: { id: pageScan.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
            },
          });
        }
      });

      this.logger.log(
        `Analysis results saved for ${page.url}, scan ID: ${pageScan.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Error saving analysis results: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Фильтрует проблемы по префиксу кода
   * @param issues Список проблем
   * @param prefix Префикс кода проблемы
   */
  private filterIssuesByPrefix(issues: any[], prefix: string): any[] {
    return issues.filter((issue) => issue.code.startsWith(prefix));
  }

  /**
   * Вычисляет общую оценку на основе результатов анализаторов
   * @param result Результат комплексного анализа
   */
  private calculateOverallScore(result: ITechnicalAnalysisResult): void {
    const analyzerNames = Object.keys(result.analyzers);

    if (analyzerNames.length === 0) {
      result.overallScore = 0;
      return;
    }

    // Вычисляем среднее значение оценок всех анализаторов
    let totalScore = 0;

    for (const name of analyzerNames) {
      totalScore += result.analyzers[name].score;
    }

    result.overallScore = Math.round(totalScore / analyzerNames.length);
  }

  /**
   * Вычисляет статистику по проблемам
   * @param result Результат комплексного анализа
   */
  private calculateIssuesSummary(result: ITechnicalAnalysisResult): void {
    // Сбрасываем счетчики
    result.summary.criticalIssuesCount = 0;
    result.summary.majorIssuesCount = 0;
    result.summary.moderateIssuesCount = 0;
    result.summary.minorIssuesCount = 0;
    result.summary.infoIssuesCount = 0;
    result.summary.totalIssuesCount = 0;

    // Суммируем проблемы по всем анализаторам
    for (const name in result.analyzers) {
      const issues = result.analyzers[name].issues;

      for (const issue of issues) {
        switch (issue.severity) {
          case 'critical':
            result.summary.criticalIssuesCount++;
            break;
          case 'major':
            result.summary.majorIssuesCount++;
            break;
          case 'moderate':
            result.summary.moderateIssuesCount++;
            break;
          case 'minor':
            result.summary.minorIssuesCount++;
            break;
          case 'info':
            result.summary.infoIssuesCount++;
            break;
        }
      }
    }

    // Подсчитываем общее количество проблем
    result.summary.totalIssuesCount =
      result.summary.criticalIssuesCount +
      result.summary.majorIssuesCount +
      result.summary.moderateIssuesCount +
      result.summary.minorIssuesCount +
      result.summary.infoIssuesCount;
  }
}
