import { IAnalysisResult } from './analysis.interface';

/**
 * Интерфейс для результатов анализа контента
 */
export interface IContentAnalysisResult extends IAnalysisResult {
  metrics: {
    contentLength: number; // Количество символов контента
    wordCount: number; // Количество слов
    paragraphCount: number; // Количество абзацев
    averageSentenceLength: number; // Средняя длина предложения
    readabilityScores: {
      fleschKincaid?: number; // Индекс удобочитаемости Флеша-Кинкейда
      smog?: number; // Индекс SMOG
      colemanLiau?: number; // Индекс Колемана-Лиау
      automatedReadability?: number; // Индекс автоматической читаемости
    };
    contentToCodeRatio: number; // Соотношение контента к коду
    keywordDensity: Record<string, number>; // Плотность ключевых слов
    uniquenessScore: number; // Оценка уникальности контента (0-100)
    formattingQuality: {
      usesHeadings: boolean; // Использование заголовков
      usesBulletPoints: boolean; // Использование списков
      usesEmphasis: boolean; // Использование выделений (bold, italic)
      usesImages: boolean; // Использование изображений внутри текста
      headingToContentRatio: number; // Соотношение заголовков к контенту
    };
    mediaContent: {
      imagesCount: number; // Количество изображений
      videosCount: number; // Количество видео
      audioCount: number; // Количество аудио
      hasAltText: number; // Количество изображений с alt-текстом
      missingAltText: number; // Количество изображений без alt-текста
    };
    languageStatistics: {
      detectedLanguage?: string; // Обнаруженный язык
      languageConfidence?: number; // Уверенность в определении языка
      secondaryLanguages?: Record<string, number>; // Соотношение слов на других языках
    };
  };
}
