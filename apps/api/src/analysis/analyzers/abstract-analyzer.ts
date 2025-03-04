import { Logger } from '@nestjs/common';
import {
  IAnalysisIssue,
  IAnalysisOptions,
  IAnalysisResult,
  IPageToAnalyze,
} from '../interfaces/analysis.interface';
import { IAnalyzer } from '../interfaces/analyzer.interface';

/**
 * Абстрактный класс анализатора, содержащий общую логику для всех анализаторов
 */
export abstract class AbstractAnalyzer<T extends IAnalysisResult>
  implements IAnalyzer<T>
{
  protected readonly logger: Logger;

  constructor(protected readonly name: string) {
    this.logger = new Logger(name);
  }

  /**
   * Выполняет анализ страницы
   * @param page Страница для анализа
   * @param options Опции для анализа
   */
  public async analyze(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<T> {
    this.logger.log(`Starting analysis for ${page.url}`);

    try {
      // Выполняем предварительную обработку
      await this.preAnalysis(page, options);

      // Выполняем основной анализ
      const result = await this.doAnalyze(page, options);

      // Выполняем постобработку
      const finalResult = await this.postAnalysis(result, page, options);

      this.logger.log(
        `Analysis completed for ${page.url} with score: ${finalResult.score}`,
      );

      return finalResult;
    } catch (error) {
      this.logger.error(
        `Error during analysis for ${page.url}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Получает название анализатора
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Получает описание анализатора
   */
  public abstract getDescription(): string;

  /**
   * Предварительная обработка перед анализом
   * @param page Страница для анализа
   * @param options Опции для анализа
   */
  protected async preAnalysis(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<void> {
    // По умолчанию ничего не делает, но может быть переопределен в наследниках
  }

  /**
   * Выполняет основной анализ
   * @param page Страница для анализа
   * @param options Опции для анализа
   */
  protected abstract doAnalyze(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<T>;

  /**
   * Постобработка после анализа
   * @param result Результат анализа
   * @param page Страница для анализа
   * @param options Опции для анализа
   */
  protected async postAnalysis(
    result: T,
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<T> {
    // Рассчитываем общий балл на основе найденных проблем
    result.score = this.calculateScore(result.issues);

    // Устанавливаем время завершения
    result.timestamp = new Date().toISOString();

    return result;
  }

  /**
   * Рассчитывает оценку на основе списка проблем
   * @param issues Список проблем
   */
  protected calculateScore(issues: IAnalysisIssue[]): number {
    // Начинаем со 100 баллов и вычитаем баллы за каждую проблему
    let score = 100;

    // Вычитаем баллы за каждую проблему в зависимости от серьезности
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'major':
          score -= 10;
          break;
        case 'moderate':
          score -= 5;
          break;
        case 'minor':
          score -= 2;
          break;
        case 'info':
          score -= 0;
          break;
      }
    }

    // Ограничиваем оценку диапазоном от 0 до 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Создает объект проблемы
   * @param code Код проблемы
   * @param message Сообщение о проблеме
   * @param severity Серьезность проблемы
   * @param element Селектор элемента (опционально)
   * @param link Ссылка на дополнительную информацию (опционально)
   * @param recommendations Рекомендации по исправлению (опционально)
   */
  protected createIssue(
    code: string,
    message: string,
    severity: 'critical' | 'major' | 'moderate' | 'minor' | 'info',
    element?: string,
    link?: string,
    recommendations?: string[],
  ): IAnalysisIssue {
    return {
      code,
      message,
      severity,
      element,
      link,
      recommendations,
    };
  }
}
