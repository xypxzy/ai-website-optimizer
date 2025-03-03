import { IAnalysisResult } from './analysis.interface';

/**
 * Интерфейс для результатов анализа производительности
 */
export interface IPerformanceAnalysisResult extends IAnalysisResult {
  metrics: {
    pageLoadTime: number; // Время полной загрузки страницы в мс
    firstContentfulPaint: number; // Время до первого отображения контента в мс
    timeToInteractive: number; // Время до интерактивности в мс
    htmlSize: number; // Размер HTML в байтах
    cssSize: number; // Размер CSS в байтах
    jsSize: number; // Размер JavaScript в байтах
    totalImageSize: number; // Общий размер изображений в байтах
    imageCount: number; // Количество изображений
    requestCount: number; // Общее количество HTTP-запросов
    requestTypes: {
      html: number;
      css: number;
      js: number;
      image: number;
      font: number;
      other: number;
    };
    serverResponseTime: number; // Время ответа сервера в мс
    serverErrors: Record<string, any>; // Информация об ошибках сервера
    cachingHeaders: Record<string, any>; // Информация о заголовках кэширования
    usesCDN: boolean; // Использует ли сайт CDN
  };
}
