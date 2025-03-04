import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PromptGeneratorService } from '../promt-generator/prompt-generator.service';
import { ContentAnalyzer } from './analyzers/content-analyzer';
import { LinkAnalyzer } from './analyzers/link-analyzer';
import { MobileAnalyzer } from './analyzers/mobile-analyzer';
import { PerformanceAnalyzer } from './analyzers/performance-analyzer';
import { SecurityAnalyzer } from './analyzers/security-analyzer';
import { SeoAnalyzer } from './analyzers/seo-analyzer';
import { StructureAnalyzer } from './analyzers/structure-analyzer';
import {
  IAnalysisOptions,
  IAnalysisResult,
  IPageToAnalyze,
} from './interfaces/analysis.interface';
import { IAnalyzer } from './interfaces/analyzer.interface';
import { IContentAnalysisResult } from './interfaces/content-analysis.interface';
import { ILinkAnalysisResult } from './interfaces/link-analysis.interface';
import { IMobileAnalysisResult } from './interfaces/mobile-analysis.interface';
import { IPerformanceAnalysisResult } from './interfaces/performance-analysis.interface';
import { ISecurityAnalysisResult } from './interfaces/security-analysis.interface';
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
    private readonly promptGenerator: PromptGeneratorService,
    private readonly seoAnalyzer: SeoAnalyzer,
    private readonly performanceAnalyzer: PerformanceAnalyzer,
    private readonly structureAnalyzer: StructureAnalyzer,
    private readonly linkAnalyzer: LinkAnalyzer,
    private readonly mobileAnalyzer: MobileAnalyzer,
    private readonly contentAnalyzer: ContentAnalyzer,
    private readonly securityAnalyzer: SecurityAnalyzer,
  ) {
    // Регистрируем все анализаторы
    this.analyzers.push(seoAnalyzer);
    this.analyzers.push(performanceAnalyzer);
    this.analyzers.push(structureAnalyzer);
    this.analyzers.push(linkAnalyzer);
    this.analyzers.push(mobileAnalyzer);
    this.analyzers.push(contentAnalyzer);
    this.analyzers.push(securityAnalyzer);
  }

  /**
   * Запускает технический анализ для сканирования
   */
  public async runTechnicalAnalysisForScan(scanId: string): Promise<void> {
    const scan = await this.prisma.pageScan.findUnique({
      where: { id: scanId },
    });

    if (!scan || !scan.htmlSnapshot) {
      throw new Error('Scan not found or HTML snapshot is missing');
    }

    // Запускаем технический анализ
    const analysisResult = await this.analyzePage(
      {
        url: scan.url,
        html: scan.htmlSnapshot,
        screenshot: scan.screenshotUrl ?? undefined,
      },
      undefined, // опции анализа
      scanId, // передаем ID сканирования
    );

    // Генерируем промпты на основе результатов анализа
    await this.promptGenerator.generatePrompts(scanId, analysisResult);
  }

  /**
   * Выполняет комплексный технический анализ страницы
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
      if (scanId) {
        await this.saveAnalysisResults(page, result, scanId);
      }

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

      // Заполняем данные по ссылкам
      if (pageScan.linkAnalysis) {
        const linkData = pageScan.linkAnalysis;

        result.analyzers['LinkAnalyzer'] = {
          score: 0, // Рассчитаем позже
          issues: [], // Получим из метаданных
          metrics: {
            internalLinksCount: linkData.internalLinksCount,
            externalLinksCount: linkData.externalLinksCount,
            brokenLinksCount: linkData.brokenLinksCount,
            internalLinks: linkData.internalLinks as any,
            externalLinks: linkData.externalLinks as any,
            brokenLinks: linkData.brokenLinks as any,
            anchorTexts: linkData.anchorTexts as any,
            emptyLinks: 0, // Дополним позже
            linksWithoutTitle: 0, // Дополним позже
            linkDistribution: {
              header: 0,
              content: 0,
              footer: 0,
              sidebar: 0,
            },
          },
          timestamp: linkData.createdAt.toISOString(),
        } as ILinkAnalysisResult;
      }

      // Заполняем данные по мобильной оптимизации
      if (pageScan.mobileAnalysis) {
        const mobileData = pageScan.mobileAnalysis;

        result.analyzers['MobileAnalyzer'] = {
          score: 0, // Рассчитаем позже
          issues: [], // Получим из метаданных
          metrics: {
            isResponsive: mobileData.isResponsive,
            hasViewport: mobileData.hasViewport,
            viewportConfig: {},
            mediaQueries: 0, // Дополним позже
            mobileFirstCSS: false, // Дополним позже
            touchTargetIssues: mobileData.tapTargetIssues ? 1 : 0,
            fontSizeIssues: 0, // Дополним позже
            hasMobileVersion: mobileData.hasMobileVersion,
            performanceMetrics: {
              mobileLoadTime: mobileData.mobileLoadTime,
              mobileInteractive: 0, // Дополним позже
              mobileFCP: 0, // Дополним позже
            },
            touchableElements: {
              total: 0, // Дополним позже
              tooSmall: 0, // Дополним позже
              tooCrowded: 0, // Дополним позже
            },
          },
          timestamp: mobileData.createdAt.toISOString(),
        } as IMobileAnalysisResult;
      }

      // Заполняем данные по контенту
      if (pageScan.contentAnalysis) {
        const contentData = pageScan.contentAnalysis;

        result.analyzers['ContentAnalyzer'] = {
          score: 0, // Рассчитаем позже
          issues: [], // Получим из метаданных
          metrics: {
            contentLength: contentData.contentLength,
            wordCount: 0, // Дополним позже
            paragraphCount: 0, // Дополним позже
            averageSentenceLength: 0, // Дополним позже
            readabilityScores: {},
            contentToCodeRatio: 0, // Дополним позже
            keywordDensity: contentData.keywordDistribution as any,
            uniquenessScore: contentData.contentUniqueness,
            formattingQuality: {
              usesHeadings: false, // Дополним позже
              usesBulletPoints: false, // Дополним позже
              usesEmphasis: false, // Дополним позже
              usesImages: false, // Дополним позже
              headingToContentRatio: 0, // Дополним позже
            },
            mediaContent: {
              imagesCount: 0, // Дополним позже
              videosCount: 0, // Дополним позже
              audioCount: 0, // Дополним позже
              hasAltText: 0, // Дополним позже
              missingAltText: 0, // Дополним позже
            },
            languageStatistics: {},
          },
          timestamp: contentData.createdAt.toISOString(),
        } as IContentAnalysisResult;
      }

      // Заполняем данные по безопасности
      if (pageScan.securityAnalysis) {
        const securityData = pageScan.securityAnalysis;

        result.analyzers['SecurityAnalyzer'] = {
          score: 0, // Рассчитаем позже
          issues: [], // Получим из метаданных
          metrics: {
            usesHttps: securityData.usesHttps,
            hasMixedContent: securityData.hasMixedContent,
            sslCertificate: {
              valid: true, // Дополним позже
            },
            securityHeaders: {
              contentSecurityPolicy: false, // Дополним позже
              xContentTypeOptions: false, // Дополним позже
              xFrameOptions: false, // Дополним позже
              xXssProtection: false, // Дополним позже
              strictTransportSecurity: false, // Дополним позже
              referrerPolicy: false, // Дополним позже
              permissionsPolicy: false, // Дополним позже
            },
            cookieSecurity: {
              hasCookies: false, // Дополним позже
              secureCookies: 0, // Дополним позже
              httpOnlyCookies: 0, // Дополним позже
              sameSiteCookies: 0, // Дополним позже
              thirdPartyCookies: 0, // Дополним позже
            },
            vulnerabilities: {
              outdatedLibraries: 0, // Дополним позже
              knownVulnerabilities: [], // Дополним позже
            },
          },
          timestamp: securityData.createdAt.toISOString(),
        } as ISecurityAnalysisResult;
      }

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
   */
  private async saveAnalysisResults(
    page: IPageToAnalyze,
    result: ITechnicalAnalysisResult,
    scanId: string,
  ): Promise<void> {
    try {
      // Находим запись сканирования
      const pageScan = await this.prisma.pageScan.findUnique({
        where: { id: scanId },
      });

      if (!pageScan) {
        this.logger.warn(`Page scan not found with ID: ${scanId}`);
        return;
      }

      // Используем транзакцию для атомарного сохранения всех результатов
      await this.prisma.$transaction(async (tx) => {
        // Сохраняем результаты SEO-анализа
        const seoResult = result.analyzers['SeoAnalyzer'] as ISeoAnalysisResult;
        if (seoResult) {
          await tx.sEOAnalysis.upsert({
            where: { pageScanId: scanId },
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
              pageScanId: scanId,
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
            where: { pageScanId: scanId },
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
              pageScanId: scanId,
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

        // Сохраняем результаты анализа ссылок
        const linkResult = result.analyzers[
          'LinkAnalyzer'
        ] as ILinkAnalysisResult;
        if (linkResult) {
          await tx.linkAnalysis.upsert({
            where: { pageScanId: scanId },
            update: {
              internalLinksCount: linkResult.metrics.internalLinksCount,
              externalLinksCount: linkResult.metrics.externalLinksCount,
              brokenLinksCount: linkResult.metrics.brokenLinksCount,
              internalLinks: linkResult.metrics.internalLinks,
              externalLinks: linkResult.metrics.externalLinks,
              brokenLinks: linkResult.metrics.brokenLinks || null,
              anchorTexts: linkResult.metrics.anchorTexts,
              noFollowLinks: {}, // Дополним позже
              linkStructure: linkResult.metrics.linkDistribution || null,
              linkIssues:
                this.filterIssuesByPrefix(linkResult.issues, 'link') || null,
            },
            create: {
              pageScanId: scanId,
              internalLinksCount: linkResult.metrics.internalLinksCount,
              externalLinksCount: linkResult.metrics.externalLinksCount,
              brokenLinksCount: linkResult.metrics.brokenLinksCount,
              internalLinks: linkResult.metrics.internalLinks,
              externalLinks: linkResult.metrics.externalLinks,
              brokenLinks: linkResult.metrics.brokenLinks || null,
              anchorTexts: linkResult.metrics.anchorTexts,
              noFollowLinks: {}, // Дополним позже
              linkStructure: linkResult.metrics.linkDistribution || null,
              linkIssues:
                this.filterIssuesByPrefix(linkResult.issues, 'link') || null,
            },
          });
        }

        // Сохраняем результаты мобильного анализа
        const mobileResult = result.analyzers[
          'MobileAnalyzer'
        ] as IMobileAnalysisResult;
        if (mobileResult) {
          await tx.mobileAnalysis.upsert({
            where: { pageScanId: scanId },
            update: {
              isResponsive: mobileResult.metrics.isResponsive,
              hasViewport: mobileResult.metrics.hasViewport,
              tapTargetIssues: mobileResult.metrics.touchTargetIssues > 0,
              hasMobileVersion: mobileResult.metrics.hasMobileVersion,
              mobileLoadTime:
                mobileResult.metrics.performanceMetrics.mobileLoadTime,
              mobileScore: mobileResult.score,
              viewportIssues: {}, // Дополним позже
              tapTargetData: {
                total: mobileResult.metrics.touchableElements.total,
                tooSmall: mobileResult.metrics.touchableElements.tooSmall,
                tooCrowded: mobileResult.metrics.touchableElements.tooCrowded,
              },
              mobileIssues:
                this.filterIssuesByPrefix(mobileResult.issues, 'mobile') ||
                null,
            },
            create: {
              pageScanId: scanId,
              isResponsive: mobileResult.metrics.isResponsive,
              hasViewport: mobileResult.metrics.hasViewport,
              tapTargetIssues: mobileResult.metrics.touchTargetIssues > 0,
              hasMobileVersion: mobileResult.metrics.hasMobileVersion,
              mobileLoadTime:
                mobileResult.metrics.performanceMetrics.mobileLoadTime,
              mobileScore: mobileResult.score,
              viewportIssues: {}, // Дополним позже
              tapTargetData: {
                total: mobileResult.metrics.touchableElements.total,
                tooSmall: mobileResult.metrics.touchableElements.tooSmall,
                tooCrowded: mobileResult.metrics.touchableElements.tooCrowded,
              },
              mobileIssues:
                this.filterIssuesByPrefix(mobileResult.issues, 'mobile') ||
                null,
            },
          });
        }

        // Сохраняем результаты анализа контента
        const contentResult = result.analyzers[
          'ContentAnalyzer'
        ] as IContentAnalysisResult;
        if (contentResult) {
          await tx.contentAnalysis.upsert({
            where: { pageScanId: scanId },
            update: {
              contentLength: contentResult.metrics.contentLength,
              contentUniqueness: contentResult.metrics.uniquenessScore,
              keywordCount: Object.keys(contentResult.metrics.keywordDensity)
                .length,
              keywordDistribution: contentResult.metrics.keywordDensity,
              readabilityScore:
                contentResult.metrics.readabilityScores.fleschKincaid || 0,
              formattingQuality:
                contentResult.metrics.formattingQuality.usesHeadings &&
                contentResult.metrics.formattingQuality.usesBulletPoints &&
                contentResult.metrics.formattingQuality.usesEmphasis
                  ? 1.0
                  : 0.5,
              textToMediaRatio: contentResult.metrics.contentToCodeRatio,
              contentIssues:
                this.filterIssuesByPrefix(contentResult.issues, 'content') ||
                null,
            },
            create: {
              pageScanId: scanId,
              contentLength: contentResult.metrics.contentLength,
              contentUniqueness: contentResult.metrics.uniquenessScore,
              keywordCount: Object.keys(contentResult.metrics.keywordDensity)
                .length,
              keywordDistribution: contentResult.metrics.keywordDensity,
              readabilityScore:
                contentResult.metrics.readabilityScores.fleschKincaid || 0,
              formattingQuality:
                contentResult.metrics.formattingQuality.usesHeadings &&
                contentResult.metrics.formattingQuality.usesBulletPoints &&
                contentResult.metrics.formattingQuality.usesEmphasis
                  ? 1.0
                  : 0.5,
              textToMediaRatio: contentResult.metrics.contentToCodeRatio,
              contentIssues:
                this.filterIssuesByPrefix(contentResult.issues, 'content') ||
                null,
            },
          });
        }

        // Сохраняем результаты анализа безопасности
        const securityResult = result.analyzers[
          'SecurityAnalyzer'
        ] as ISecurityAnalysisResult;
        if (securityResult) {
          await tx.securityAnalysis.upsert({
            where: { pageScanId: scanId },
            update: {
              usesHttps: securityResult.metrics.usesHttps,
              hasMixedContent: securityResult.metrics.hasMixedContent,
              sslInfo: securityResult.metrics.sslCertificate || Prisma.JsonNull,
              securityHeaders: securityResult.metrics.securityHeaders || null,
              owaspIssues:
                securityResult.metrics.vulnerabilities.knownVulnerabilities ||
                null,
              securityIssues:
                this.filterIssuesByPrefix(securityResult.issues, 'security') ||
                null,
            },
            create: {
              pageScanId: scanId,
              usesHttps: securityResult.metrics.usesHttps,
              hasMixedContent: securityResult.metrics.hasMixedContent,
              sslInfo: securityResult.metrics.sslCertificate || Prisma.JsonNull,
              securityHeaders: securityResult.metrics.securityHeaders || null,
              owaspIssues:
                securityResult.metrics.vulnerabilities.knownVulnerabilities ||
                null,
              securityIssues:
                this.filterIssuesByPrefix(securityResult.issues, 'security') ||
                null,
            },
          });
        }

        // Обновляем статус сканирования, если он не завершен
        if (pageScan.status !== 'completed') {
          await tx.pageScan.update({
            where: { id: scanId },
            data: {
              status: 'completed',
              completedAt: new Date(),
            },
          });
        }
      });

      this.logger.log(
        `Analysis results saved for ${page.url}, scan ID: ${scanId}`,
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
   */
  private filterIssuesByPrefix(issues: any[], prefix: string): any[] {
    return issues.filter((issue) => issue.code.startsWith(prefix));
  }

  /**
   * Вычисляет общую оценку на основе результатов анализаторов
   */
  private calculateOverallScore(result: ITechnicalAnalysisResult): void {
    const analyzerNames = Object.keys(result.analyzers);

    if (analyzerNames.length === 0) {
      result.overallScore = 0;
      return;
    }

    // Используем взвешенную оценку для разных категорий анализа
    const weights: Record<string, number> = {
      SeoAnalyzer: 1.0,
      PerformanceAnalyzer: 1.0,
      MobileAnalyzer: 0.9,
      SecurityAnalyzer: 0.8,
      ContentAnalyzer: 0.7,
      LinkAnalyzer: 0.6,
      StructureAnalyzer: 0.5,
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const name of analyzerNames) {
      const weight = weights[name] || 0.5;
      totalScore += result.analyzers[name].score * weight;
      totalWeight += weight;
    }

    result.overallScore = Math.round(
      totalWeight > 0 ? totalScore / totalWeight : 0,
    );
  }

  /**
   * Вычисляет статистику по проблемам
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
