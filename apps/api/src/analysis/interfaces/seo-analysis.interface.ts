import { IAnalysisResult } from './analysis.interface';

/**
 * Интерфейс для результатов SEO-анализа
 */
export interface ISeoAnalysisResult extends IAnalysisResult {
  metrics: {
    hasTitle: boolean;
    hasDescription: boolean;
    titleLength: number;
    descriptionLength: number;
    headingsStructure: {
      h1Count: number;
      h2Count: number;
      h3Count: number;
      h4Count: number;
      h5Count: number;
      h6Count: number;
      hasProperStructure: boolean;
    };
    textToHtmlRatio: number;
    keywordDensity: Record<string, number>;
    hasDuplicateContent: boolean;
    hasCanonicalUrl: boolean;
    hasSitemap: boolean;
    hasRobotsTxt: boolean;
    schemaOrgData?: Record<string, any>;
  };
}
