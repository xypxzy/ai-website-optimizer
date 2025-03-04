import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import {
  IAnalysisOptions,
  IPageToAnalyze,
} from '../interfaces/analysis.interface';
import { IStructureAnalysisResult } from '../interfaces/structure-analysis.interface';
import { AbstractAnalyzer } from './abstract-analyzer';

@Injectable()
export class StructureAnalyzer extends AbstractAnalyzer<IStructureAnalysisResult> {
  constructor() {
    super('StructureAnalyzer');
  }

  public getDescription(): string {
    return 'Анализирует структуру страницы, включая иерархию, навигацию и семантическую разметку';
  }

  protected async doAnalyze(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<IStructureAnalysisResult> {
    const dom = new JSDOM(page.html);
    const document = dom.window.document;

    // Инициализируем результат анализа
    const result: IStructureAnalysisResult = {
      score: 0, // Будет рассчитано в postAnalysis
      issues: [],
      metrics: {
        totalPages: 1, // Для одной страницы
        maxDepth: 0, // Будет рассчитано
        averageDepth: 0, // Будет рассчитано
        hierarchy: {
          levels: 0, // Будет рассчитано
          breadth: 0, // Будет рассчитано
        },
        navigation: {
          hasMainNav: false, // Будет определено
          hasFooterNav: false, // Будет определено
          hasBreadcrumbs: false, // Будет определено
          menuDepth: 0, // Будет рассчитано
        },
        structure: {
          hasHeader: false, // Будет определено
          hasFooter: false, // Будет определено
          hasSidebar: false, // Будет определено
          mainContentRatio: 0, // Будет рассчитано
        },
        pageArchitecture: {
          semanticStructure: false, // Будет определено
          sectionsCount: 0, // Будет подсчитано
          divNestingLevel: 0, // Будет рассчитано
        },
      },
      timestamp: '',
    };

    // Анализируем различные аспекты структуры
    await Promise.all([
      this.analyzePageStructure(document, result),
      this.analyzeNavigationElements(document, result),
      this.analyzeSemanticStructure(document, result),
      this.analyzeDOMHierarchy(document, result),
    ]);

    return result;
  }

  /**
   * Анализирует основную структуру страницы
   */
  private async analyzePageStructure(
    document: Document,
    result: IStructureAnalysisResult,
  ): Promise<void> {
    // Проверяем наличие заголовка
    result.metrics.structure.hasHeader =
      document.querySelector('header') !== null ||
      document.querySelector('.header') !== null ||
      document.querySelector('#header') !== null;

    // Проверяем наличие футера
    result.metrics.structure.hasFooter =
      document.querySelector('footer') !== null ||
      document.querySelector('.footer') !== null ||
      document.querySelector('#footer') !== null;

    // Проверяем наличие боковой панели
    result.metrics.structure.hasSidebar =
      document.querySelector('aside') !== null ||
      document.querySelector('.sidebar') !== null ||
      document.querySelector('#sidebar') !== null;

    // Подсчитываем количество секций
    result.metrics.pageArchitecture.sectionsCount =
      document.querySelectorAll('section').length;

    // Рассчитываем соотношение основного контента к общему размеру страницы
    const mainContent =
      document.querySelector('main') ||
      document.querySelector('#content') ||
      document.querySelector('.content');

    if (mainContent) {
      const mainContentSize = mainContent.textContent?.length || 0;
      const totalContentSize = document.body?.textContent?.length || 1;

      result.metrics.structure.mainContentRatio =
        totalContentSize > 0 ? mainContentSize / totalContentSize : 0;
    }

    // Проверяем структуру страницы на наличие обязательных элементов
    if (!result.metrics.structure.hasHeader) {
      result.issues.push(
        this.createIssue(
          'structure-no-header',
          'На странице отсутствует явный заголовок (header)',
          'moderate',
          undefined,
          undefined,
          [
            'Добавьте семантический тег <header> для улучшения структуры страницы',
            'Используйте атрибут role="banner" для основного заголовка',
          ],
        ),
      );
    }

    if (!result.metrics.structure.hasFooter) {
      result.issues.push(
        this.createIssue(
          'structure-no-footer',
          'На странице отсутствует явный футер (footer)',
          'minor',
          undefined,
          undefined,
          [
            'Добавьте семантический тег <footer> для улучшения структуры страницы',
            'Используйте атрибут role="contentinfo" для футера',
          ],
        ),
      );
    }

    if (result.metrics.structure.mainContentRatio < 0.4) {
      result.issues.push(
        this.createIssue(
          'structure-low-content-ratio',
          `Низкое соотношение основного контента к общему содержимому: ${(result.metrics.structure.mainContentRatio * 100).toFixed(2)}%`,
          'moderate',
          undefined,
          undefined,
          [
            'Увеличьте объем основного контента на странице',
            'Убедитесь, что основной контент заключен в теги <main> или соответствующие div',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует навигационные элементы
   */
  private async analyzeNavigationElements(
    document: Document,
    result: IStructureAnalysisResult,
  ): Promise<void> {
    // Проверяем наличие главной навигации
    const mainNav =
      document.querySelector('nav') ||
      document.querySelector('[role="navigation"]') ||
      document.querySelector('.nav-main') ||
      document.querySelector('#main-nav');

    result.metrics.navigation.hasMainNav = mainNav !== null;

    // Проверяем наличие навигации в футере
    const footer =
      document.querySelector('footer') ||
      document.querySelector('.footer') ||
      document.querySelector('#footer');

    result.metrics.navigation.hasFooterNav =
      footer?.querySelector('nav') !== null ||
      footer?.querySelector('ul') !== null;

    // Проверяем наличие хлебных крошек
    result.metrics.navigation.hasBreadcrumbs =
      document.querySelector('[class*="breadcrumb"]') !== null ||
      document.querySelector('[id*="breadcrumb"]') !== null ||
      document.querySelector('nav[aria-label*="Breadcrumb"]') !== null;

    // Рассчитываем глубину меню
    if (mainNav) {
      const calculateMenuDepth = (element: Element, depth = 1): number => {
        const childLists = element.querySelectorAll(
          ':scope > li > ul, :scope > li > ol',
        );
        if (childLists.length === 0) {
          return depth;
        }

        let maxChildDepth = 0;
        childLists.forEach((list) => {
          const childDepth = calculateMenuDepth(list, depth + 1);
          maxChildDepth = Math.max(maxChildDepth, childDepth);
        });

        return maxChildDepth;
      };

      const navLists = mainNav.querySelectorAll('ul, ol');
      let maxDepth = 0;

      navLists.forEach((list) => {
        if (list.parentElement?.tagName !== 'LI') {
          // Только корневые списки
          const depth = calculateMenuDepth(list);
          maxDepth = Math.max(maxDepth, depth);
        }
      });

      result.metrics.navigation.menuDepth = maxDepth;
    }

    // Анализируем навигационные элементы
    if (!result.metrics.navigation.hasMainNav) {
      result.issues.push(
        this.createIssue(
          'structure-no-main-nav',
          'На странице отсутствует главная навигация',
          'major',
          undefined,
          undefined,
          [
            'Добавьте семантический тег <nav> для главной навигации',
            'Используйте атрибут role="navigation" для навигационных элементов',
          ],
        ),
      );
    }

    if (result.metrics.navigation.menuDepth > 3) {
      result.issues.push(
        this.createIssue(
          'structure-deep-menu',
          `Слишком глубокая структура меню: ${result.metrics.navigation.menuDepth} уровней`,
          'moderate',
          undefined,
          undefined,
          [
            'Упростите навигацию, уменьшив вложенность меню до 2-3 уровней',
            'Используйте мега-меню или альтернативные способы организации навигации',
          ],
        ),
      );
    }

    if (
      !result.metrics.navigation.hasBreadcrumbs &&
      document.querySelectorAll('a').length > 20
    ) {
      result.issues.push(
        this.createIssue(
          'structure-no-breadcrumbs',
          'На странице отсутствуют хлебные крошки',
          'minor',
          undefined,
          undefined,
          [
            'Добавьте навигационные "хлебные крошки" для улучшения навигации',
            'Используйте атрибут aria-label="Breadcrumb" для обозначения хлебных крошек',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует семантическую структуру страницы
   */
  private async analyzeSemanticStructure(
    document: Document,
    result: IStructureAnalysisResult,
  ): Promise<void> {
    // Проверяем использование семантических тегов HTML5
    const semanticTags = [
      'article',
      'section',
      'nav',
      'aside',
      'header',
      'footer',
      'main',
      'figure',
      'figcaption',
      'time',
    ];

    let semanticTagsCount = 0;
    semanticTags.forEach((tag) => {
      semanticTagsCount += document.querySelectorAll(tag).length;
    });

    result.metrics.pageArchitecture.semanticStructure = semanticTagsCount >= 3;

    // Рассчитываем максимальный уровень вложенности div-элементов
    const findMaxNesting = (element: Element, currentDepth = 1): number => {
      const children = element.querySelectorAll(':scope > div');
      if (children.length === 0) {
        return currentDepth;
      }

      let maxChildDepth = 0;
      children.forEach((child) => {
        const childDepth = findMaxNesting(child, currentDepth + 1);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      });

      return maxChildDepth;
    };

    const bodyDivs = document.body?.querySelectorAll(':scope > div') || [];
    let maxDepth = 0;

    bodyDivs.forEach((div) => {
      const depth = findMaxNesting(div);
      maxDepth = Math.max(maxDepth, depth);
    });

    result.metrics.pageArchitecture.divNestingLevel = maxDepth;

    // Анализируем семантическую структуру
    if (!result.metrics.pageArchitecture.semanticStructure) {
      result.issues.push(
        this.createIssue(
          'structure-poor-semantics',
          'Страница недостаточно использует семантические элементы HTML5',
          'major',
          undefined,
          undefined,
          [
            'Используйте семантические теги HTML5 вместо универсальных div',
            'Добавьте теги article, section, aside, main для улучшения структуры',
            'Используйте микроразметку Schema.org для улучшения семантики контента',
          ],
        ),
      );
    }

    if (result.metrics.pageArchitecture.divNestingLevel > 10) {
      result.issues.push(
        this.createIssue(
          'structure-excessive-nesting',
          `Чрезмерная вложенность div-элементов: ${result.metrics.pageArchitecture.divNestingLevel} уровней`,
          'major',
          undefined,
          undefined,
          [
            'Упростите HTML-структуру, уменьшив глубину вложенности элементов',
            'Замените вложенные div на семантические элементы, где это возможно',
            'Используйте CSS Grid или Flexbox для создания сложных макетов без глубокой вложенности',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует иерархию DOM-дерева
   */
  private async analyzeDOMHierarchy(
    document: Document,
    result: IStructureAnalysisResult,
  ): Promise<void> {
    // Рассчитываем максимальную глубину DOM-дерева
    const calculateElementDepth = (element: Element): number => {
      const children = element.children;
      if (children.length === 0) {
        return 1;
      }

      let maxChildDepth = 0;
      Array.from(children).forEach((child) => {
        const childDepth = calculateElementDepth(child);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      });

      return maxChildDepth + 1;
    };

    const bodyDepth = calculateElementDepth(
      document.body || document.documentElement,
    );
    result.metrics.maxDepth = bodyDepth;

    // Рассчитываем среднюю глубину
    let totalDepth = 0;
    let elementCount = 0;

    const calculateAverageDepth = (element: Element, currentDepth = 1) => {
      totalDepth += currentDepth;
      elementCount++;

      Array.from(element.children).forEach((child) => {
        calculateAverageDepth(child, currentDepth + 1);
      });
    };

    calculateAverageDepth(document.body || document.documentElement);
    result.metrics.averageDepth =
      elementCount > 0 ? totalDepth / elementCount : 0;

    // Рассчитываем уровни иерархии и среднюю ширину
    let levelCounts: Record<number, number> = {};

    const countElementsByLevel = (element: Element, level = 1) => {
      levelCounts[level] = (levelCounts[level] || 0) + 1;

      Array.from(element.children).forEach((child) => {
        countElementsByLevel(child, level + 1);
      });
    };

    countElementsByLevel(document.body || document.documentElement);

    const levels = Object.keys(levelCounts).length;
    const totalNodes = Object.values(levelCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const averageBreadth = levels > 0 ? totalNodes / levels : 0;

    result.metrics.hierarchy.levels = levels;
    result.metrics.hierarchy.breadth = averageBreadth;

    // Анализируем иерархию DOM
    if (result.metrics.maxDepth > 15) {
      result.issues.push(
        this.createIssue(
          'structure-deep-dom',
          `Слишком глубокая структура DOM: ${result.metrics.maxDepth} уровней`,
          'major',
          undefined,
          undefined,
          [
            'Упростите DOM-структуру, уменьшив глубину вложенности элементов',
            'Используйте CSS для стилизации вместо вложенных элементов',
            'Рассмотрите использование компонентного подхода для улучшения структуры',
          ],
        ),
      );
    }

    if (result.metrics.hierarchy.breadth > 20) {
      result.issues.push(
        this.createIssue(
          'structure-wide-dom',
          `Слишком широкая структура DOM: в среднем ${result.metrics.hierarchy.breadth.toFixed(1)} элементов на уровень`,
          'moderate',
          undefined,
          undefined,
          [
            'Рассмотрите возможность группировки элементов в логические блоки',
            'Используйте семантические теги для более четкой структуры',
          ],
        ),
      );
    }
  }
}
