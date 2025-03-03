import {
  IAnalysisOptions,
  IAnalysisResult,
  IPageToAnalyze,
} from './analysis.interface';

/**
 * Интерфейс для всех анализаторов
 */
export interface IAnalyzer<T extends IAnalysisResult> {
  /**
   * Выполняет анализ страницы
   * @param page Страница для анализа
   * @param options Опции для анализа
   */
  analyze(page: IPageToAnalyze, options?: IAnalysisOptions): Promise<T>;

  /**
   * Получает название анализатора
   */
  getName(): string;

  /**
   * Получает описание анализатора
   */
  getDescription(): string;
}
