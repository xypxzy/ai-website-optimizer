import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import {
  IAnalysisOptions,
  IPageToAnalyze,
} from '../interfaces/analysis.interface';
import { ISeoAnalysisResult } from '../interfaces/seo-analysis.interface';
import { AbstractAnalyzer } from './abstract-analyzer';

@Injectable()
export class SeoAnalyzer extends AbstractAnalyzer<ISeoAnalysisResult> {
  constructor() {
    super('SeoAnalyzer');
  }

  public getDescription(): string {
    return 'Анализирует SEO-факторы страницы, включая мета-теги, заголовки, структуру и ключевые слова';
  }

  protected async doAnalyze(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<ISeoAnalysisResult> {
    const dom = new JSDOM(page.html);
    const document = dom.window.document;

    // Инициализируем результат анализа
    const result: ISeoAnalysisResult = {
      score: 0, // Будет рассчитано в postAnalysis
      issues: [],
      metrics: {
        hasTitle: false,
        hasDescription: false,
        titleLength: 0,
        descriptionLength: 0,
        headingsStructure: {
          h1Count: 0,
          h2Count: 0,
          h3Count: 0,
          h4Count: 0,
          h5Count: 0,
          h6Count: 0,
          hasProperStructure: true,
        },
        textToHtmlRatio: 0,
        keywordDensity: {},
        hasDuplicateContent: false,
        hasCanonicalUrl: false,
        hasSitemap: false,
        hasRobotsTxt: false,
      },
      timestamp: '',
    };

    // Анализируем различные аспекты SEO
    await Promise.all([
      this.analyzeTitleAndMetaTags(document, result),
      this.analyzeHeadingsStructure(document, result),
      this.analyzeTextToHtmlRatio(document, result),
      this.analyzeKeywordDensity(document, result),
      this.analyzeCanonicalUrl(document, result),
      this.analyzeSitemapAndRobots(page.url, result),
    ]);

    return result;
  }

  /**
   * Анализирует заголовок и мета-теги
   */
  private async analyzeTitleAndMetaTags(
    document: Document,
    result: ISeoAnalysisResult,
  ): Promise<void> {
    // Проверяем тег title
    const titleElement = document.querySelector('title');
    result.metrics.hasTitle = !!titleElement;

    if (titleElement) {
      const titleText = titleElement.textContent || '';
      result.metrics.titleLength = titleText.length;

      // Проверяем длину title
      if (titleText.length < 10) {
        result.issues.push(
          this.createIssue(
            'seo-title-too-short',
            'Заголовок страницы слишком короткий',
            'major',
            'title',
            undefined,
            [
              'Заголовок должен содержать не менее 10 символов',
              'Включите ключевые слова в заголовок',
            ],
          ),
        );
      } else if (titleText.length > 60) {
        result.issues.push(
          this.createIssue(
            'seo-title-too-long',
            'Заголовок страницы слишком длинный',
            'moderate',
            'title',
            undefined,
            [
              'Оптимальная длина заголовка - до 60 символов',
              'Сократите заголовок, сохранив ключевые слова',
            ],
          ),
        );
      }

      // Проверяем наличие ключевых слов в title
      if (!/[a-zA-Zа-яА-Я]{3,}/i.test(titleText)) {
        result.issues.push(
          this.createIssue(
            'seo-title-no-keywords',
            'Заголовок не содержит полноценных слов',
            'major',
            'title',
            undefined,
            ['Включите ключевые слова в заголовок страницы'],
          ),
        );
      }
    } else {
      result.issues.push(
        this.createIssue(
          'seo-title-missing',
          'На странице отсутствует тег title',
          'critical',
          undefined,
          undefined,
          ['Добавьте тег title в секцию head'],
        ),
      );
    }

    // Проверяем мета-тег description
    const descriptionElement = document.querySelector(
      'meta[name="description"]',
    );
    result.metrics.hasDescription = !!descriptionElement;

    if (descriptionElement) {
      const descriptionContent =
        descriptionElement.getAttribute('content') || '';
      result.metrics.descriptionLength = descriptionContent.length;

      // Проверяем длину description
      if (descriptionContent.length < 50) {
        result.issues.push(
          this.createIssue(
            'seo-description-too-short',
            'Мета-описание слишком короткое',
            'major',
            'meta[name="description"]',
            undefined,
            [
              'Мета-описание должно содержать не менее 50 символов',
              'Включите ключевые слова и призыв к действию',
            ],
          ),
        );
      } else if (descriptionContent.length > 160) {
        result.issues.push(
          this.createIssue(
            'seo-description-too-long',
            'Мета-описание слишком длинное',
            'moderate',
            'meta[name="description"]',
            undefined,
            [
              'Оптимальная длина мета-описания - до 160 символов',
              'Сократите описание, сохранив ключевые фразы',
            ],
          ),
        );
      }

      // Проверяем наличие ключевых слов в description
      if (!/[a-zA-Zа-яА-Я]{3,}/i.test(descriptionContent)) {
        result.issues.push(
          this.createIssue(
            'seo-description-no-keywords',
            'Мета-описание не содержит полноценных слов',
            'major',
            'meta[name="description"]',
            undefined,
            ['Включите ключевые слова в мета-описание'],
          ),
        );
      }
    } else {
      result.issues.push(
        this.createIssue(
          'seo-description-missing',
          'На странице отсутствует мета-тег description',
          'critical',
          undefined,
          undefined,
          ['Добавьте мета-тег description в секцию head'],
        ),
      );
    }

    // Проверяем viewport
    const viewportElement = document.querySelector('meta[name="viewport"]');
    if (!viewportElement) {
      result.issues.push(
        this.createIssue(
          'seo-viewport-missing',
          'На странице отсутствует мета-тег viewport',
          'critical',
          undefined,
          undefined,
          [
            'Добавьте мета-тег viewport: <meta name="viewport" content="width=device-width, initial-scale=1.0">',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует структуру заголовков
   */
  private async analyzeHeadingsStructure(
    document: Document,
    result: ISeoAnalysisResult,
  ): Promise<void> {
    // Подсчитываем количество заголовков каждого уровня
    for (let i = 1; i <= 6; i++) {
      const headings = document.querySelectorAll(`h${i}`);
      // FIXME: TS не понимает, что headings - это NodeList
      // @ts-ignore
      result.metrics.headingsStructure[
        `h${i}Count` as keyof typeof result.metrics.headingsStructure
      ] = headings.length;
    }

    // Проверяем наличие H1
    if (result.metrics.headingsStructure.h1Count === 0) {
      result.issues.push(
        this.createIssue(
          'seo-h1-missing',
          'На странице отсутствует заголовок H1',
          'critical',
          undefined,
          undefined,
          ['Добавьте один заголовок H1, содержащий основное ключевое слово'],
        ),
      );
      result.metrics.headingsStructure.hasProperStructure = false;
    } else if (result.metrics.headingsStructure.h1Count > 1) {
      result.issues.push(
        this.createIssue(
          'seo-multiple-h1',
          `На странице присутствует ${result.metrics.headingsStructure.h1Count} заголовков H1`,
          'major',
          undefined,
          undefined,
          ['Оставьте только один заголовок H1 на странице'],
        ),
      );
      result.metrics.headingsStructure.hasProperStructure = false;
    }

    // Проверяем иерархию заголовков
    const headings = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, h5, h6'),
    );
    let lastLevel = 0;

    for (const heading of headings) {
      const level = parseInt(heading.tagName.substring(1), 10);

      // Проверяем, не пропущены ли уровни (например, h1 -> h3 без h2)
      if (level > lastLevel + 1 && lastLevel > 0) {
        result.issues.push(
          this.createIssue(
            'seo-heading-skip-level',
            `Нарушена иерархия заголовков: пропущен уровень между H${lastLevel} и H${level}`,
            'moderate',
            heading.tagName.toLowerCase(),
            undefined,
            [
              `Добавьте промежуточный заголовок H${lastLevel + 1} или понизьте уровень текущего заголовка`,
            ],
          ),
        );
        result.metrics.headingsStructure.hasProperStructure = false;
      }

      lastLevel = level;
    }
  }

  /**
   * Анализирует соотношение текста к HTML
   */
  private async analyzeTextToHtmlRatio(
    document: Document,
    result: ISeoAnalysisResult,
  ): Promise<void> {
    // Получаем весь текст страницы
    const text = document.body ? document.body.textContent || '' : '';
    const html = document.documentElement.outerHTML;

    // Рассчитываем соотношение текста к HTML (в процентах)
    result.metrics.textToHtmlRatio =
      html.length > 0 ? (text.length / html.length) * 100 : 0;

    // Проверяем соотношение
    if (result.metrics.textToHtmlRatio < 10) {
      result.issues.push(
        this.createIssue(
          'seo-low-text-html-ratio',
          `Низкое соотношение текста к HTML: ${result.metrics.textToHtmlRatio.toFixed(2)}%`,
          'moderate',
          undefined,
          undefined,
          [
            'Увеличьте количество текстового контента на странице',
            'Уменьшите размер HTML-кода, удалив ненужные элементы и комментарии',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует плотность ключевых слов
   */
  private async analyzeKeywordDensity(
    document: Document,
    result: ISeoAnalysisResult,
  ): Promise<void> {
    // Получаем весь текст страницы
    const text = document.body ? document.body.textContent || '' : '';

    // Разбиваем текст на слова, удаляем стоп-слова и считаем частоту слов
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter((word) => word.length > 3) // Игнорируем короткие слова
      .filter((word) => !this.isStopWord(word)); // Игнорируем стоп-слова

    const wordCount: Record<string, number> = {};
    const totalWords = words.length;

    // Подсчитываем частоту каждого слова
    for (const word of words) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }

    // Преобразуем количество в процентное соотношение
    for (const word in wordCount) {
      result.metrics.keywordDensity[word] =
        totalWords > 0 ? (wordCount[word] / totalWords) * 100 : 0;
    }

    // Проверяем, есть ли слова с слишком высокой плотностью (возможный спам)
    for (const word in result.metrics.keywordDensity) {
      if (result.metrics.keywordDensity[word] > 5) {
        // Больше 5% - потенциальный спам
        result.issues.push(
          this.createIssue(
            'seo-keyword-stuffing',
            `Слишком высокая плотность ключевого слова "${word}": ${result.metrics.keywordDensity[word].toFixed(2)}%`,
            'major',
            undefined,
            undefined,
            [
              'Уменьшите частоту использования этого слова',
              'Используйте синонимы и близкие по смыслу слова',
            ],
          ),
        );
      }
    }
  }

  /**
   * Анализирует наличие канонического URL
   */
  private async analyzeCanonicalUrl(
    document: Document,
    result: ISeoAnalysisResult,
  ): Promise<void> {
    const canonicalElement = document.querySelector('link[rel="canonical"]');
    result.metrics.hasCanonicalUrl = !!canonicalElement;

    if (!canonicalElement) {
      result.issues.push(
        this.createIssue(
          'seo-canonical-missing',
          'На странице отсутствует канонический URL',
          'moderate',
          undefined,
          undefined,
          [
            'Добавьте тег link rel="canonical" для предотвращения проблем с дублированным контентом',
          ],
        ),
      );
    } else {
      const href = canonicalElement.getAttribute('href');
      if (!href) {
        result.issues.push(
          this.createIssue(
            'seo-canonical-empty',
            'Канонический URL указан, но атрибут href пустой',
            'major',
            'link[rel="canonical"]',
            undefined,
            ['Укажите полный URL в атрибуте href тега link rel="canonical"'],
          ),
        );
      }
    }
  }

  /**
   * Анализирует наличие sitemap.xml и robots.txt
   */
  private async analyzeSitemapAndRobots(
    url: string,
    result: ISeoAnalysisResult,
  ): Promise<void> {
    try {
      // В реальном коде здесь будет проверка наличия этих файлов путем отправки HTTP-запросов
      // Для примера просто устанавливаем значения
      result.metrics.hasSitemap = true;
      result.metrics.hasRobotsTxt = true;

      // Добавляем проверки для демонстрации
      if (!result.metrics.hasSitemap) {
        result.issues.push(
          this.createIssue(
            'seo-sitemap-missing',
            'Отсутствует файл sitemap.xml',
            'moderate',
            undefined,
            undefined,
            [
              'Создайте файл sitemap.xml и разместите его в корне сайта',
              'Укажите sitemap в файле robots.txt',
            ],
          ),
        );
      }

      if (!result.metrics.hasRobotsTxt) {
        result.issues.push(
          this.createIssue(
            'seo-robots-missing',
            'Отсутствует файл robots.txt',
            'moderate',
            undefined,
            undefined,
            ['Создайте файл robots.txt и разместите его в корне сайта'],
          ),
        );
      }
    } catch (error) {
      this.logger.error(`Error analyzing sitemap and robots: ${error.message}`);
    }
  }

  /**
   * Проверяет, является ли слово стоп-словом (для фильтрации при анализе ключевых слов)
   * @param word Слово для проверки
   */
  private isStopWord(word: string): boolean {
    // Список стоп-слов (упрощенный, в реальном проекте должен быть более полным)
    const stopWords = new Set([
      'the',
      'and',
      'or',
      'but',
      'for',
      'nor',
      'yet',
      'so',
      'if',
      'then',
      'else',
      'when',
      'where',
      'why',
      'how',
      'all',
      'any',
      'both',
      'each',
      'few',
      'more',
      'most',
      'some',
      'such',
      'than',
      'that',
      'these',
      'this',
      'those',
      'what',
      'which',
      'while',
      'with',
      // Русские стоп-слова
      'и',
      'в',
      'во',
      'не',
      'что',
      'он',
      'на',
      'я',
      'с',
      'со',
      'как',
      'его',
      'от',
      'по',
      'к',
      'у',
      'за',
      'из',
      'об',
      'для',
      'это',
      'уже',
      'его',
      'а',
      'без',
      'более',
      'бы',
      'был',
      'была',
      'были',
      'будет',
      'будто',
      'даже',
      'другой',
      'ее',
      'ей',
      'есть',
      'еще',
      'же',
      'им',
      'их',
      'мы',
      'ни',
      'но',
      'ну',
      'о',
      'ой',
      'они',
      'оно',
      'очень',
      'при',
      'свой',
      'так',
      'такой',
      'те',
      'тебя',
      'тем',
      'то',
      'ты',
      'чем',
      'что',
      'чтобы',
    ]);

    return stopWords.has(word.toLowerCase());
  }
}
