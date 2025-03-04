import { IAnalysisResult } from './analysis.interface';

/**
 * Интерфейс для результатов анализа мобильной оптимизации
 */
export interface IMobileAnalysisResult extends IAnalysisResult {
  metrics: {
    isResponsive: boolean; // Является ли сайт адаптивным
    hasViewport: boolean; // Наличие viewport мета-тега
    viewportConfig: {
      width?: string;
      initialScale?: number;
      userScalable?: boolean;
    };
    mediaQueries: number; // Количество медиа-запросов
    mobileFirstCSS: boolean; // Использует ли сайт подход "mobile-first"
    touchTargetIssues: number; // Количество проблем с размерами элементов для тапа
    fontSizeIssues: number; // Количество проблем с размерами шрифтов
    hasMobileVersion: boolean; // Наличие отдельной мобильной версии
    mobileRedirect?: string; // URL мобильной версии (если есть)
    performanceMetrics: {
      mobileLoadTime: number; // Время загрузки на мобильных устройствах (мс)
      mobileInteractive: number; // Время до интерактивности на мобильных (мс)
      mobileFCP: number; // First Contentful Paint на мобильных (мс)
    };
    touchableElements: {
      total: number; // Общее количество интерактивных элементов
      tooSmall: number; // Количество слишком маленьких элементов
      tooCrowded: number; // Количество слишком близко расположенных элементов
    };
  };
}
