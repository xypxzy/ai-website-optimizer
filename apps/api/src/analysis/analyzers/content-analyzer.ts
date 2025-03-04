import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import {
  IAnalysisOptions,
  IPageToAnalyze,
} from '../interfaces/analysis.interface';
import { IContentAnalysisResult } from '../interfaces/content-analysis.interface';
import { AbstractAnalyzer } from './abstract-analyzer';

@Injectable()
export class ContentAnalyzer extends AbstractAnalyzer<IContentAnalysisResult> {
  constructor() {
    super('ContentAnalyzer');
  }

  public getDescription(): string {
    return 'Анализирует качество контента, включая удобочитаемость, уникальность и форматирование';
  }

  protected async doAnalyze(
    page: IPageToAnalyze,
    options?: IAnalysisOptions,
  ): Promise<IContentAnalysisResult> {
    const dom = new JSDOM(page.html);
    const document = dom.window.document;

    // Инициализируем результат анализа
    const result: IContentAnalysisResult = {
      score: 0, // Будет рассчитано в postAnalysis
      issues: [],
      metrics: {
        contentLength: 0,
        wordCount: 0,
        paragraphCount: 0,
        averageSentenceLength: 0,
        readabilityScores: {},
        contentToCodeRatio: 0,
        keywordDensity: {},
        uniquenessScore: 0,
        formattingQuality: {
          usesHeadings: false,
          usesBulletPoints: false,
          usesEmphasis: false,
          usesImages: false,
          headingToContentRatio: 0,
        },
        mediaContent: {
          imagesCount: 0,
          videosCount: 0,
          audioCount: 0,
          hasAltText: 0,
          missingAltText: 0,
        },
        languageStatistics: {},
      },
      timestamp: '',
    };

    // Анализируем различные аспекты контента
    await Promise.all([
      this.analyzeTextContent(document, result),
      this.analyzeReadability(document, result),
      this.analyzeFormatting(document, result),
      this.analyzeMediaContent(document, result),
      this.analyzeKeywords(document, result),
      this.analyzeLanguage(document, result),
    ]);

    return result;
  }

  /**
   * Анализирует текстовое содержимое
   */
  private async analyzeTextContent(
    document: Document,
    result: IContentAnalysisResult,
  ): Promise<void> {
    // Получаем основной контент
    const mainContent = this.getMainContent(document);
    const contentText = mainContent.textContent || '';
    const htmlSize = document.documentElement.outerHTML.length;

    // Подсчитываем базовые метрики текста
    result.metrics.contentLength = contentText.length;
    result.metrics.wordCount = this.countWords(contentText);
    result.metrics.paragraphCount = mainContent.querySelectorAll('p').length;
    result.metrics.contentToCodeRatio =
      htmlSize > 0 ? contentText.length / htmlSize : 0;

    // Подсчитываем количество предложений
    const sentences = contentText
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);
    const totalSentenceLength = sentences.reduce((sum, sentence) => {
      const wordCount = this.countWords(sentence);
      return sum + wordCount;
    }, 0);

    result.metrics.averageSentenceLength =
      sentences.length > 0 ? totalSentenceLength / sentences.length : 0;

    // Вычисляем приблизительную уникальность контента
    // В реальном проекте здесь будет более сложная логика с проверкой внешних источников
    result.metrics.uniquenessScore = 85; // Приблизительное значение для демонстрации

    // Анализируем проблемы с контентом
    if (result.metrics.contentLength < 300) {
      result.issues.push(
        this.createIssue(
          'content-too-short',
          `Слишком мало текстового контента: ${result.metrics.contentLength} символов`,
          'critical',
          undefined,
          undefined,
          [
            'Добавьте больше полезного контента на страницу',
            'Минимальный рекомендуемый объем текста для страницы: 300-500 символов',
          ],
        ),
      );
    }

    if (result.metrics.wordCount < 100) {
      result.issues.push(
        this.createIssue(
          'content-few-words',
          `Недостаточное количество слов: ${result.metrics.wordCount}`,
          'major',
          undefined,
          undefined,
          [
            'Расширьте содержание страницы, добавив больше полезной информации',
            'Рекомендуемый минимум: 300-500 слов для основных страниц',
          ],
        ),
      );
    }

    if (result.metrics.contentToCodeRatio < 0.1) {
      result.issues.push(
        this.createIssue(
          'content-low-text-code-ratio',
          `Низкое соотношение текста к коду: ${(result.metrics.contentToCodeRatio * 100).toFixed(2)}%`,
          'moderate',
          undefined,
          undefined,
          [
            'Увеличьте количество текстового контента',
            'Оптимизируйте HTML, удалив ненужный код',
            'Избегайте чрезмерного использования div-контейнеров и встроенных стилей',
          ],
        ),
      );
    }

    if (result.metrics.paragraphCount < 3 && result.metrics.wordCount > 100) {
      result.issues.push(
        this.createIssue(
          'content-formatting-paragraphs',
          `Недостаточное разделение текста на абзацы: ${result.metrics.paragraphCount} абзацев`,
          'moderate',
          undefined,
          undefined,
          [
            'Разделите текст на логические абзацы для улучшения читаемости',
            'Используйте теги <p> для каждого абзаца',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует удобочитаемость контента
   */
  private async analyzeReadability(
    document: Document,
    result: IContentAnalysisResult,
  ): Promise<void> {
    const mainContent = this.getMainContent(document);
    const contentText = mainContent.textContent || '';

    // Подсчитываем количество слов, предложений и слогов
    const wordCount = result.metrics.wordCount;
    const sentences = contentText
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);
    const sentenceCount = sentences.length;
    const syllableCount = this.estimateSyllableCount(contentText);

    // Вычисляем индекс удобочитаемости Флеша-Кинкейда
    // FK = 206.835 - 1.015 × (words / sentences) - 84.6 × (syllables / words)
    if (sentenceCount > 0 && wordCount > 0) {
      const fleschKincaid =
        206.835 -
        1.015 * (wordCount / sentenceCount) -
        84.6 * (syllableCount / wordCount);
      result.metrics.readabilityScores.fleschKincaid = Math.max(
        0,
        Math.min(100, fleschKincaid),
      );
    }

    // Вычисляем индекс Колемана-Лиау
    // CLI = 0.0588 × (characters / words × 100) - 0.296 × (sentences / words × 100) - 15.8
    const charCount = contentText.replace(/\s/g, '').length;
    if (wordCount > 0 && sentenceCount > 0) {
      const colemanLiau =
        0.0588 * ((charCount / wordCount) * 100) -
        0.296 * ((sentenceCount / wordCount) * 100) -
        15.8;
      result.metrics.readabilityScores.colemanLiau = Math.max(
        0,
        Math.min(100, colemanLiau),
      );
    }

    // Вычисляем индекс автоматической читаемости
    // ARI = 4.71 × (characters / words) + 0.5 × (words / sentences) - 21.43
    if (wordCount > 0 && sentenceCount > 0) {
      const automatedReadability =
        4.71 * (charCount / wordCount) +
        0.5 * (wordCount / sentenceCount) -
        21.43;
      result.metrics.readabilityScores.automatedReadability = Math.max(
        0,
        Math.min(100, automatedReadability),
      );
    }

    // Анализируем удобочитаемость
    if (result.metrics.averageSentenceLength > 25) {
      result.issues.push(
        this.createIssue(
          'content-long-sentences',
          `Слишком длинные предложения: в среднем ${result.metrics.averageSentenceLength.toFixed(1)} слов`,
          'moderate',
          undefined,
          undefined,
          [
            'Сократите длину предложений для улучшения читаемости',
            'Оптимальная длина предложения: 15-20 слов',
            'Используйте смесь коротких и средних предложений для лучшего восприятия',
          ],
        ),
      );
    }

    // Анализируем индекс удобочитаемости
    const fleschScore = result.metrics.readabilityScores.fleschKincaid;
    if (fleschScore !== undefined && fleschScore < 30) {
      result.issues.push(
        this.createIssue(
          'content-low-readability',
          `Низкий индекс удобочитаемости Флеша-Кинкейда: ${fleschScore.toFixed(1)}`,
          'major',
          undefined,
          undefined,
          [
            'Упростите текст, используя более короткие предложения и слова',
            'Избегайте сложных конструкций и технических терминов без объяснения',
            'Используйте активный залог вместо пассивного',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует форматирование контента
   */
  private async analyzeFormatting(
    document: Document,
    result: IContentAnalysisResult,
  ): Promise<void> {
    const mainContent = this.getMainContent(document);

    // Проверяем наличие заголовков
    const headings = mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
    result.metrics.formattingQuality.usesHeadings = headings.length > 0;

    // Проверяем наличие списков
    const lists = mainContent.querySelectorAll('ul, ol');
    result.metrics.formattingQuality.usesBulletPoints = lists.length > 0;

    // Проверяем наличие выделений
    const emphasis = mainContent.querySelectorAll('strong, b, em, i');
    result.metrics.formattingQuality.usesEmphasis = emphasis.length > 0;

    // Проверяем наличие изображений внутри контента
    const images = mainContent.querySelectorAll('img');
    result.metrics.formattingQuality.usesImages = images.length > 0;

    // Рассчитываем соотношение заголовков к контенту
    const contentTextLength = (mainContent.textContent || '').length;
    let headingsTextLength = 0;
    headings.forEach((heading) => {
      headingsTextLength += (heading.textContent || '').length;
    });

    result.metrics.formattingQuality.headingToContentRatio =
      contentTextLength > 0 ? headingsTextLength / contentTextLength : 0;

    // Анализируем форматирование
    if (
      !result.metrics.formattingQuality.usesHeadings &&
      result.metrics.wordCount > 200
    ) {
      result.issues.push(
        this.createIssue(
          'content-no-headings',
          'Отсутствуют заголовки в тексте',
          'major',
          undefined,
          undefined,
          [
            'Добавьте заголовки для структурирования контента',
            'Используйте иерархию заголовков (H2, H3, H4) для логического разделения',
            'Включайте ключевые слова в заголовки',
          ],
        ),
      );
    }

    if (
      !result.metrics.formattingQuality.usesBulletPoints &&
      result.metrics.wordCount > 300
    ) {
      result.issues.push(
        this.createIssue(
          'content-no-lists',
          'Отсутствуют списки в длинном тексте',
          'moderate',
          undefined,
          undefined,
          [
            'Используйте маркированные (ul) или нумерованные (ol) списки для перечислений',
            'Списки улучшают сканируемость текста и восприятие информации',
          ],
        ),
      );
    }

    if (
      !result.metrics.formattingQuality.usesEmphasis &&
      result.metrics.wordCount > 200
    ) {
      result.issues.push(
        this.createIssue(
          'content-no-emphasis',
          'Отсутствуют выделения в тексте',
          'minor',
          undefined,
          undefined,
          [
            'Используйте выделения (strong, em) для ключевых фраз и важных моментов',
            'Выделения помогают обратить внимание на важную информацию',
          ],
        ),
      );
    }

    if (
      headings.length > 0 &&
      result.metrics.formattingQuality.headingToContentRatio > 0.3
    ) {
      result.issues.push(
        this.createIssue(
          'content-too-many-headings',
          'Слишком большое количество заголовков относительно контента',
          'moderate',
          undefined,
          undefined,
          [
            'Уменьшите количество заголовков или добавьте больше контента под каждым заголовком',
            'Заголовки должны обозначать логические разделы, а не заменять контент',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует медиа-контент
   */
  private async analyzeMediaContent(
    document: Document,
    result: IContentAnalysisResult,
  ): Promise<void> {
    // Подсчитываем количество изображений
    const images = document.querySelectorAll('img');
    result.metrics.mediaContent.imagesCount = images.length;

    // Проверяем наличие alt-текста у изображений
    images.forEach((img) => {
      if (img.hasAttribute('alt') && img.getAttribute('alt')?.trim()) {
        result.metrics.mediaContent.hasAltText++;
      } else {
        result.metrics.mediaContent.missingAltText++;
      }
    });

    // Подсчитываем количество видео
    const videos = document.querySelectorAll(
      'video, iframe[src*="youtube"], iframe[src*="vimeo"]',
    );
    result.metrics.mediaContent.videosCount = videos.length;

    // Подсчитываем количество аудио
    const audio = document.querySelectorAll('audio');
    result.metrics.mediaContent.audioCount = audio.length;

    // Анализируем медиа-контент
    if (
      result.metrics.mediaContent.imagesCount === 0 &&
      result.metrics.wordCount > 300
    ) {
      result.issues.push(
        this.createIssue(
          'content-no-images',
          'Отсутствуют изображения в длинном тексте',
          'moderate',
          undefined,
          undefined,
          [
            'Добавьте релевантные изображения для иллюстрации контента',
            'Изображения улучшают восприятие информации и удерживают внимание',
          ],
        ),
      );
    }

    if (result.metrics.mediaContent.missingAltText > 0) {
      result.issues.push(
        this.createIssue(
          'content-missing-alt',
          `${result.metrics.mediaContent.missingAltText} изображений без атрибута alt`,
          'major',
          undefined,
          undefined,
          [
            'Добавьте атрибут alt для всех изображений',
            'Alt-текст важен для доступности и SEO',
            'Описывайте содержимое изображения в alt-тексте кратко и информативно',
          ],
        ),
      );
    }

    if (
      result.metrics.mediaContent.imagesCount > 10 &&
      result.metrics.mediaContent.imagesCount > result.metrics.wordCount / 50
    ) {
      result.issues.push(
        this.createIssue(
          'content-too-many-images',
          'Слишком много изображений относительно текста',
          'moderate',
          undefined,
          undefined,
          [
            'Уменьшите количество изображений или добавьте больше текстового контента',
            'Убедитесь, что каждое изображение имеет ценность для пользователя',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует ключевые слова
   */
  private async analyzeKeywords(
    document: Document,
    result: IContentAnalysisResult,
  ): Promise<void> {
    const mainContent = this.getMainContent(document);
    const contentText = mainContent.textContent || '';

    // Разбиваем текст на слова, удаляем стоп-слова и считаем частоту слов
    const words = contentText
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

    // Анализируем ключевые слова
    const highDensityKeywords = Object.entries(result.metrics.keywordDensity)
      .filter(([_, density]) => density > 5)
      .map(([word, density]) => ({ word, density }));

    if (highDensityKeywords.length > 0) {
      result.issues.push(
        this.createIssue(
          'content-keyword-stuffing',
          `Обнаружено переоптимизированное использование ключевых слов: ${highDensityKeywords.map((k) => `"${k.word}" (${k.density.toFixed(1)}%)`).join(', ')}`,
          'major',
          undefined,
          undefined,
          [
            'Уменьшите частоту использования этих ключевых слов',
            'Используйте синонимы и вариации ключевых слов',
            'Пишите естественный текст для людей, а не для поисковых систем',
          ],
        ),
      );
    }

    const lowKeywordVariety =
      Object.keys(result.metrics.keywordDensity).length < totalWords * 0.2;
    if (lowKeywordVariety && totalWords > 100) {
      result.issues.push(
        this.createIssue(
          'content-low-vocabulary',
          'Ограниченный словарный запас, мало уникальных слов',
          'moderate',
          undefined,
          undefined,
          [
            'Расширьте словарный запас текста',
            'Используйте синонимы и разнообразные формулировки',
          ],
        ),
      );
    }
  }

  /**
   * Анализирует язык контента
   */
  private async analyzeLanguage(
    document: Document,
    result: IContentAnalysisResult,
  ): Promise<void> {
    const mainContent = this.getMainContent(document);
    const contentText = mainContent.textContent || '';

    // В реальном проекте здесь будет использоваться библиотека определения языка
    // Например, franc.js или langdetect
    // Для примера используем упрощенный подход

    // Получаем язык из атрибута lang
    const htmlLang = document.documentElement.getAttribute('lang');

    if (htmlLang) {
      result.metrics.languageStatistics.detectedLanguage =
        htmlLang.split('-')[0];
      result.metrics.languageStatistics.languageConfidence = 0.95;
    } else {
      // Упрощенное определение языка
      // В реальном проекте здесь будет алгоритм определения языка
      const russianPattern = /[а-яА-ЯёЁ]/g;
      const russianChars = contentText.match(russianPattern)?.length || 0;

      if (russianChars > contentText.length * 0.3) {
        result.metrics.languageStatistics.detectedLanguage = 'ru';
        result.metrics.languageStatistics.languageConfidence = 0.8;
      } else {
        result.metrics.languageStatistics.detectedLanguage = 'en';
        result.metrics.languageStatistics.languageConfidence = 0.7;
      }
    }

    // Анализируем язык контента
    if (!htmlLang) {
      result.issues.push(
        this.createIssue(
          'content-missing-lang',
          'Отсутствует атрибут lang в HTML-теге',
          'moderate',
          undefined,
          undefined,
          [
            'Добавьте атрибут lang в тег html, например: <html lang="ru">',
            'Атрибут lang важен для доступности и правильной работы скринридеров',
          ],
        ),
      );
    }

    if (
      result.metrics.languageStatistics.detectedLanguage &&
      htmlLang &&
      !htmlLang.startsWith(result.metrics.languageStatistics.detectedLanguage)
    ) {
      result.issues.push(
        this.createIssue(
          'content-wrong-lang',
          `Определенный язык контента (${result.metrics.languageStatistics.detectedLanguage}) не соответствует указанному в HTML (${htmlLang})`,
          'moderate',
          undefined,
          undefined,
          [
            'Убедитесь, что атрибут lang соответствует фактическому языку контента',
            'При необходимости используйте атрибут lang для отдельных элементов с другим языком',
          ],
        ),
      );
    }
  }

  /**
   * Получает основной контент страницы
   */
  private getMainContent(document: Document): Element {
    // Пытаемся найти основной контейнер контента
    const contentElements = [
      document.querySelector('main'),
      document.querySelector('article'),
      document.querySelector('[role="main"]'),
      document.querySelector('#content'),
      document.querySelector('.content'),
      document.querySelector('.main-content'),
    ].filter(Boolean);

    // Если найден контейнер контента, используем его
    if (contentElements.length > 0) {
      return contentElements[0] as Element;
    }

    // Иначе возвращаем body
    return document.body || document.documentElement;
  }

  /**
   * Подсчитывает количество слов в тексте
   */
  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  /**
   * Приблизительно подсчитывает количество слогов в тексте
   */
  private estimateSyllableCount(text: string): number {
    // Упрощенный подсчет слогов
    // В реальном проекте здесь будет более сложный алгоритм
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter((word) => word.length > 0);

    let syllableCount = 0;

    words.forEach((word) => {
      // Подсчитываем гласные буквы, но не считаем гласные в конце слова и диграфы
      const vowels = word.match(/[aeiouyаеёиоуыэюя]/gi);
      if (!vowels) return;

      let count = vowels.length;

      // Не считаем немую 'e' в конце английских слов
      if (word.match(/[a-z]/) && word.endsWith('e')) {
        count--;
      }

      // Учитываем дифтонги (приблизительно)
      const diphthongs = word.match(/[aeiouy]{2}/gi);
      if (diphthongs) {
        count -= diphthongs.length;
      }

      // Минимум 1 слог на слово
      syllableCount += Math.max(1, count);
    });

    return syllableCount;
  }

  /**
   * Проверяет, является ли слово стоп-словом
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
      'about',
      'after',
      'before',
      'during',
      'from',
      'into',
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
    ]);

    return stopWords.has(word.toLowerCase());
  }
}
