/**
 * Общий интерфейс для результатов анализа
 */
export interface IAnalysisResult {
  score: number; // Общая оценка от 0 до 100
  issues: IAnalysisIssue[]; // Список обнаруженных проблем
  metrics: Record<string, any>; // Метрики, специфичные для каждого типа анализа
  timestamp: string; // Время завершения анализа
}

/**
 * Интерфейс для проблем, обнаруженных при анализе
 */
export interface IAnalysisIssue {
  code: string; // Уникальный код проблемы
  message: string; // Описание проблемы
  severity: 'critical' | 'major' | 'moderate' | 'minor' | 'info'; // Серьезность проблемы
  element?: string; // Селектор элемента, связанного с проблемой (если применимо)
  link?: string; // Ссылка на дополнительную информацию о проблеме
  recommendations?: string[]; // Рекомендации по исправлению
}

/**
 * Интерфейс для настройки анализаторов
 */
export interface IAnalysisOptions {
  includeDetails?: boolean; // Включать подробную информацию
  threshold?: {
    critical?: number; // Порог для критических проблем
    major?: number; // Порог для серьезных проблем
    moderate?: number; // Порог для умеренных проблем
  };
  customChecks?: Record<string, boolean>; // Включение/отключение конкретных проверок
  [key: string]: any; // Дополнительные опции для конкретных анализаторов
}

/**
 * Интерфейс для страницы, которую нужно проанализировать
 */
export interface IPageToAnalyze {
  url: string;
  html: string;
  screenshot?: string;
  elements?: IPageElement[];
}

/**
 * Интерфейс элемента страницы
 */
export interface IPageElement {
  type: string;
  selector: string;
  html: string;
  screenshot?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
