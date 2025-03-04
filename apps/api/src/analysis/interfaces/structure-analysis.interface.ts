import { IAnalysisResult } from './analysis.interface';

/**
 * Интерфейс для результатов структурного анализа
 */
export interface IStructureAnalysisResult extends IAnalysisResult {
  metrics: {
    totalPages: number; // Общее количество страниц
    maxDepth: number; // Максимальная глубина вложенности
    averageDepth: number; // Средняя глубина вложенности
    hierarchy: {
      levels: number; // Количество уровней иерархии
      breadth: number; // Среднее количество узлов на уровень
    };
    navigation: {
      hasMainNav: boolean; // Наличие главной навигации
      hasFooterNav: boolean; // Наличие навигации в футере
      hasBreadcrumbs: boolean; // Наличие "хлебных крошек"
      menuDepth: number; // Глубина меню
    };
    structure: {
      hasHeader: boolean; // Наличие заголовка
      hasFooter: boolean; // Наличие футера
      hasSidebar: boolean; // Наличие боковой панели
      mainContentRatio: number; // Соотношение основного контента к общему размеру
    };
    pageArchitecture: {
      semanticStructure: boolean; // Использование семантических элементов HTML5
      sectionsCount: number; // Количество секций
      divNestingLevel: number; // Уровень вложенности div-элементов
    };
  };
}
