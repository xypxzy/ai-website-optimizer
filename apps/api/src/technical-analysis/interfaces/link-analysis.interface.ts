import { IAnalysisResult } from './analysis.interface';

/**
 * Интерфейс для результатов анализа ссылок
 */
export interface ILinkAnalysisResult extends IAnalysisResult {
  metrics: {
    internalLinksCount: number; // Количество внутренних ссылок
    externalLinksCount: number; // Количество внешних ссылок
    brokenLinksCount: number; // Количество битых ссылок
    internalLinks: Array<{
      url: string;
      text: string;
      target?: string;
      nofollow: boolean;
    }>;
    externalLinks: Array<{
      url: string;
      text: string;
      target?: string;
      nofollow: boolean;
      domain: string;
    }>;
    brokenLinks: Array<{
      url: string;
      text: string;
      status?: number;
      type: 'internal' | 'external';
    }>;
    anchorTexts: Record<string, number>; // Частота использования текста ссылок
    emptyLinks: number; // Количество ссылок без текста
    linksWithoutTitle: number; // Количество ссылок без атрибута title
    linkDistribution: {
      header: number;
      content: number;
      footer: number;
      sidebar: number;
    };
  };
}
