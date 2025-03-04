import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ITechnicalAnalysisResult } from '../analysis/analysis.service';
import { IAnalysisIssue } from '../analysis/interfaces/analysis.interface';
import { IPerformanceAnalysisResult } from '../analysis/interfaces/performance-analysis.interface';
import { ISeoAnalysisResult } from '../analysis/interfaces/seo-analysis.interface';

/**
 * Интерфейс результата генерации промптов
 */
export interface IGeneratedPrompt {
  id: string;
  name: string;
  description: string;
  promptText: string;
  targetUse: string;
}

// Тип критичности проблемы
type IssueSeverity = 'critical' | 'major' | 'moderate' | 'minor' | 'info';

interface IExtendedAnalysisIssue extends IAnalysisIssue {
  analyzerName: string;
}

// Интерфейс для категоризированных и приоритизированных проблем
interface ICategorizedIssues {
  critical: IExtendedAnalysisIssue[];
  major: IExtendedAnalysisIssue[];
  moderate: IExtendedAnalysisIssue[];
  minor: IExtendedAnalysisIssue[];
  info: IExtendedAnalysisIssue[];
}

@Injectable()
export class PromptGeneratorService {
  private readonly logger = new Logger(PromptGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Генерирует промпты для LLM на основе результатов технического анализа
   * @param scanId ID сканирования
   * @param analysisResult Результаты технического анализа
   */
  public async generatePrompts(
    scanId: string,
    analysisResult: ITechnicalAnalysisResult,
  ): Promise<IGeneratedPrompt[]> {
    this.logger.log(`Generating prompts for scan ${scanId}`);

    const generatedPrompts: IGeneratedPrompt[] = [];

    try {
      // Получаем данные о сканировании
      const pageScan = await this.prisma.pageScan.findUnique({
        where: { id: scanId },
        include: {
          project: true,
          elements: {
            select: {
              id: true,
              type: true,
              html: true,
              selector: true,
              screenshot: true,
            },
          },
        },
      });

      if (!pageScan) {
        throw new Error(`Scan with ID ${scanId} not found`);
      }

      // Собираем и категоризируем все проблемы из всех анализаторов
      const allIssues = this.collectAndCategorizeIssues(analysisResult);

      // Генерируем промпты для разных категорий анализа
      // SEO анализ
      const seoPrompt = this.generateSeoPrompt(analysisResult, allIssues);
      if (seoPrompt) generatedPrompts.push(seoPrompt);

      // Анализ производительности
      const performancePrompt = this.generatePerformancePrompt(
        analysisResult,
        allIssues,
      );
      if (performancePrompt) generatedPrompts.push(performancePrompt);

      // Анализ мобильной оптимизации
      const mobilePrompt = this.generateMobilePrompt(analysisResult, allIssues);
      if (mobilePrompt) generatedPrompts.push(mobilePrompt);

      // Анализ ссылок
      const linkPrompt = this.generateLinkPrompt(analysisResult, allIssues);
      if (linkPrompt) generatedPrompts.push(linkPrompt);

      // Анализ контента
      const contentPrompt = this.generateContentPrompt(
        analysisResult,
        allIssues,
      );
      if (contentPrompt) generatedPrompts.push(contentPrompt);

      // Анализ безопасности
      const securityPrompt = this.generateSecurityPrompt(
        analysisResult,
        allIssues,
      );
      if (securityPrompt) generatedPrompts.push(securityPrompt);

      // Генерируем промпты для отдельных типов элементов
      // Получаем типы элементов из сканирования
      const elementTypes = [...new Set(pageScan.elements.map((el) => el.type))];

      for (const elementType of elementTypes) {
        const elementsOfType = pageScan.elements.filter(
          (el) => el.type === elementType,
        );

        // Генерируем промпт для данного типа элементов
        const elementPrompt = this.generateElementPrompt(
          elementType,
          elementsOfType,
          analysisResult,
        );
        if (elementPrompt) generatedPrompts.push(elementPrompt);
      }

      // Генерируем общий промпт с обзором всех проблем и рекомендаций
      const generalPrompt = this.generateGeneralPrompt(
        analysisResult,
        allIssues,
        pageScan,
      );
      if (generalPrompt) generatedPrompts.push(generalPrompt);

      // Сохраняем промпты в базу данных
      await this.savePromptsToDatabase(scanId, generatedPrompts);

      return generatedPrompts;
    } catch (error) {
      this.logger.error(
        `Error generating prompts: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Собирает и категоризирует проблемы из всех анализаторов
   * @param analysisResult Результаты технического анализа
   */
  private collectAndCategorizeIssues(
    analysisResult: ITechnicalAnalysisResult,
  ): ICategorizedIssues {
    const categorizedIssues: ICategorizedIssues = {
      critical: [],
      major: [],
      moderate: [],
      minor: [],
      info: [],
    };

    // Проходим по всем анализаторам и собираем проблемы
    for (const analyzerName in analysisResult.analyzers) {
      const analyzer = analysisResult.analyzers[analyzerName];

      for (const issue of analyzer.issues) {
        categorizedIssues[issue.severity].push({
          ...issue,
          analyzerName, // Добавляем название анализатора для контекста
        });
      }
    }

    return categorizedIssues;
  }

  /**
   * Генерирует промпт для SEO-оптимизации
   * @param analysisResult Результаты технического анализа
   * @param categorizedIssues Категоризированные проблемы
   */
  private generateSeoPrompt(
    analysisResult: ITechnicalAnalysisResult,
    categorizedIssues: ICategorizedIssues,
  ): IGeneratedPrompt | null {
    const seoAnalyzer = analysisResult.analyzers[
      'SeoAnalyzer'
    ] as ISeoAnalysisResult;

    if (!seoAnalyzer) return null;

    // Собираем SEO-проблемы по приоритетам
    const seoIssues = this.getIssuesByPrefix(categorizedIssues, 'seo-');

    // Форматируем проблемы для включения в промпт
    const formattedIssues = this.formatIssuesForPrompt(seoIssues);

    // Собираем SEO-метрики
    const seoMetrics = JSON.stringify(seoAnalyzer.metrics, null, 2);

    // Формируем промпт для LLM
    const promptText = `
# SEO-анализ веб-страницы

## URL страницы
${analysisResult.url}

## Общая оценка SEO
${seoAnalyzer.score}/100

## Выявленные проблемы
${formattedIssues}

## Детальные метрики SEO
\`\`\`json
${seoMetrics}
\`\`\`

## Задача для LLM
На основе приведенного выше анализа, предложите конкретные улучшения для SEO-оптимизации страницы:

1. Оптимизация мета-тегов (title, description)
2. Улучшение структуры заголовков
3. Оптимизация контента с учетом ключевых слов
4. Улучшение канонических URL и перелинковки
5. Оптимизация Schema.org разметки (если применимо)

Для каждого улучшения предоставьте:
- Конкретный код или текст для внедрения
- Обоснование, почему это улучшит SEO
- Ожидаемый эффект на ранжирование

Приоритизируйте рекомендации по их потенциальному влиянию. Начните с наиболее критичных проблем.
Если у страницы уже хорошие SEO-показатели, предложите улучшения для получения конкурентного преимущества.

Пожалуйста, представьте результаты в следующем формате для каждой рекомендации:

\`\`\`
### Рекомендация: [Краткое описание]
**Приоритет:** [Высокий/Средний/Низкий]
**Текущее состояние:** [Что сейчас на странице]
**Предлагаемое решение:** [Конкретный текст или код]
**Обоснование:** [Почему это улучшит SEO]
**Ожидаемый эффект:** [Как это повлияет на ранжирование]
\`\`\`
`;

    return {
      id: '',
      name: 'SEO-оптимизация',
      description: 'Промпт для генерации рекомендаций по улучшению SEO',
      promptText,
      targetUse: 'seo',
    };
  }

  /**
   * Генерирует промпт для оптимизации производительности
   * @param analysisResult Результаты технического анализа
   * @param categorizedIssues Категоризированные проблемы
   */
  private generatePerformancePrompt(
    analysisResult: ITechnicalAnalysisResult,
    categorizedIssues: ICategorizedIssues,
  ): IGeneratedPrompt | null {
    const performanceAnalyzer = analysisResult.analyzers[
      'PerformanceAnalyzer'
    ] as IPerformanceAnalysisResult;

    if (!performanceAnalyzer) return null;

    // Собираем проблемы производительности по приоритетам
    const perfIssues = this.getIssuesByPrefix(categorizedIssues, 'perf-');

    // Форматируем проблемы для включения в промпт
    const formattedIssues = this.formatIssuesForPrompt(perfIssues);

    // Собираем метрики производительности
    const perfMetrics = JSON.stringify(performanceAnalyzer.metrics, null, 2);

    // Формируем промпт для LLM
    const promptText = `
# Анализ производительности веб-страницы

## URL страницы
${analysisResult.url}

## Общая оценка производительности
${performanceAnalyzer.score}/100

## Ключевые метрики
- Время загрузки страницы: ${performanceAnalyzer.metrics.pageLoadTime} мс
- First Contentful Paint: ${performanceAnalyzer.metrics.firstContentfulPaint} мс
- Time to Interactive: ${performanceAnalyzer.metrics.timeToInteractive} мс
- Размер HTML: ${(performanceAnalyzer.metrics.htmlSize / 1024).toFixed(2)} KB
- Размер CSS: ${(performanceAnalyzer.metrics.cssSize / 1024).toFixed(2)} KB
- Размер JavaScript: ${(performanceAnalyzer.metrics.jsSize / 1024).toFixed(2)} KB
- Общий размер изображений: ${(performanceAnalyzer.metrics.totalImageSize / 1024 / 1024).toFixed(2)} MB
- Количество HTTP-запросов: ${performanceAnalyzer.metrics.requestCount}
- Время ответа сервера: ${performanceAnalyzer.metrics.serverResponseTime} мс

## Выявленные проблемы
${formattedIssues}

## Детальные метрики производительности
\`\`\`json
${perfMetrics}
\`\`\`

## Задача для LLM
На основе приведенного выше анализа, предложите конкретные улучшения для оптимизации производительности страницы:

1. Оптимизация загрузки ресурсов (JavaScript, CSS, изображений)
2. Улучшение времени до первого отображения контента (FCP)
3. Улучшение времени до интерактивности (TTI)
4. Оптимизация кэширования и сжатия
5. Оптимизация HTTP-запросов
6. Улучшение времени ответа сервера

Для каждого улучшения предоставьте:
- Конкретный код для внедрения или изменения настроек
- Обоснование, почему это улучшит производительность
- Ожидаемый эффект на метрики скорости
- Примерную сложность внедрения (Низкая/Средняя/Высокая)

Приоритизируйте рекомендации по их потенциальному влиянию на улучшение производительности.
Начните с наиболее критичных проблем.

Пожалуйста, представьте результаты в следующем формате для каждой рекомендации:

\`\`\`
### Рекомендация: [Краткое описание]
**Приоритет:** [Высокий/Средний/Низкий]
**Проблема:** [Описание проблемы]
**Решение:** [Конкретный код или настройки]
**Обоснование:** [Почему это улучшит производительность]
**Ожидаемое улучшение:** [Как изменятся метрики]
**Сложность внедрения:** [Низкая/Средняя/Высокая]
\`\`\`

Предоставьте конкретные примеры кода, предпочтительно с использованием современных методов оптимизации веб-производительности.
`;

    return {
      id: '',
      name: 'Оптимизация производительности',
      description:
        'Промпт для генерации рекомендаций по улучшению производительности',
      promptText,
      targetUse: 'performance',
    };
  }

  /**
   * Генерирует промпт для анализа мобильной оптимизации
   * @param analysisResult Результаты технического анализа
   * @param categorizedIssues Категоризированные проблемы
   */
  private generateMobilePrompt(
    analysisResult: ITechnicalAnalysisResult,
    categorizedIssues: ICategorizedIssues,
  ): IGeneratedPrompt | null {
    const mobileAnalyzer = analysisResult.analyzers['MobileAnalyzer'];

    if (!mobileAnalyzer) return null;

    // Собираем проблемы мобильной оптимизации по приоритетам
    const mobileIssues = this.getIssuesByPrefix(categorizedIssues, 'mobile-');

    // Форматируем проблемы для включения в промпт
    const formattedIssues = this.formatIssuesForPrompt(mobileIssues);

    // Метрики мобильной оптимизации
    const mobileMetrics = JSON.stringify(mobileAnalyzer.metrics, null, 2);

    // Формируем промпт для LLM
    const promptText = `
# Анализ мобильной оптимизации веб-страницы

## URL страницы
${analysisResult.url}

## Общая оценка мобильной оптимизации
${mobileAnalyzer.score}/100

## Выявленные проблемы
${formattedIssues}

## Детальные метрики мобильной оптимизации
\`\`\`json
${mobileMetrics}
\`\`\`

## Задача для LLM
На основе приведенного выше анализа, предложите конкретные улучшения для оптимизации страницы на мобильных устройствах:

1. Адаптивный дизайн и отзывчивость
2. Оптимизация размеров тапабельных элементов
3. Правильная настройка viewport
4. Оптимизация шрифтов для мобильных устройств
5. Оптимизация изображений для мобильных устройств
6. Улучшение удобства использования на мобильных устройствах

Для каждого улучшения предоставьте:
- Конкретный HTML, CSS или JavaScript код для внедрения
- Обоснование, почему это улучшит мобильный опыт
- Ожидаемый эффект на метрики мобильной оптимизации

Приоритизируйте рекомендации по их потенциальному влиянию на улучшение мобильного опыта.
Начните с наиболее критичных проблем.

Пожалуйста, представьте результаты в следующем формате для каждой рекомендации:

\`\`\`
### Рекомендация: [Краткое описание]
**Приоритет:** [Высокий/Средний/Низкий]
**Проблема:** [Описание проблемы]
**Решение:** [Конкретный HTML/CSS/JS код]
**Обоснование:** [Почему это улучшит мобильный опыт]
**Ожидаемое улучшение:** [Как изменятся метрики]
\`\`\`
`;

    return {
      id: '',
      name: 'Мобильная оптимизация',
      description:
        'Промпт для генерации рекомендаций по улучшению мобильной оптимизации',
      promptText,
      targetUse: 'mobile',
    };
  }

  /**
   * Генерирует промпт для анализа ссылок
   * @param analysisResult Результаты технического анализа
   * @param categorizedIssues Категоризированные проблемы
   */
  private generateLinkPrompt(
    analysisResult: ITechnicalAnalysisResult,
    categorizedIssues: ICategorizedIssues,
  ): IGeneratedPrompt | null {
    const linkAnalyzer = analysisResult.analyzers['LinkAnalyzer'];

    if (!linkAnalyzer) return null;

    // Собираем проблемы ссылок по приоритетам
    const linkIssues = this.getIssuesByPrefix(categorizedIssues, 'link-');

    // Форматируем проблемы для включения в промпт
    const formattedIssues = this.formatIssuesForPrompt(linkIssues);

    // Метрики анализа ссылок
    const linkMetrics = JSON.stringify(linkAnalyzer.metrics, null, 2);

    // Формируем промпт для LLM
    const promptText = `
# Анализ ссылок на веб-странице

## URL страницы
${analysisResult.url}

## Общая оценка структуры ссылок
${linkAnalyzer.score}/100

## Ключевые метрики
- Внутренние ссылки: ${linkAnalyzer.metrics.internalLinksCount || 'N/A'}
- Внешние ссылки: ${linkAnalyzer.metrics.externalLinksCount || 'N/A'}
- Битые ссылки: ${linkAnalyzer.metrics.brokenLinksCount || 'N/A'}

## Выявленные проблемы
${formattedIssues}

## Детальные метрики анализа ссылок
\`\`\`json
${linkMetrics}
\`\`\`

## Задача для LLM
На основе приведенного выше анализа, предложите конкретные улучшения для оптимизации структуры ссылок на странице:

1. Исправление битых ссылок
2. Улучшение анкорного текста внутренних ссылок
3. Оптимизация внешних ссылок (атрибуты rel, target)
4. Улучшение структуры внутренней перелинковки
5. Оптимизация навигационных ссылок
6. Добавление недостающих ссылок для улучшения структуры сайта

Для каждого улучшения предоставьте:
- Конкретный HTML-код для внедрения или изменения
- Обоснование, почему это улучшит структуру ссылок
- Ожидаемый эффект на SEO и удобство использования

Приоритизируйте рекомендации по их потенциальному влиянию.
Начните с исправления критичных проблем (битые ссылки).

Пожалуйста, представьте результаты в следующем формате для каждой рекомендации:

\`\`\`
### Рекомендация: [Краткое описание]
**Приоритет:** [Высокий/Средний/Низкий]
**Текущее состояние:** [Что сейчас на странице]
**Предлагаемое изменение:** [Конкретный HTML-код]
**Обоснование:** [Почему это улучшит структуру ссылок]
**Ожидаемый эффект:** [Как это повлияет на SEO и UX]
\`\`\`
`;

    return {
      id: '',
      name: 'Анализ и оптимизация ссылок',
      description:
        'Промпт для генерации рекомендаций по улучшению структуры ссылок',
      promptText,
      targetUse: 'link',
    };
  }

  /**
   * Генерирует промпт для анализа контента
   * @param analysisResult Результаты технического анализа
   * @param categorizedIssues Категоризированные проблемы
   */
  private generateContentPrompt(
    analysisResult: ITechnicalAnalysisResult,
    categorizedIssues: ICategorizedIssues,
  ): IGeneratedPrompt | null {
    const contentAnalyzer = analysisResult.analyzers['ContentAnalyzer'];

    if (!contentAnalyzer) return null;

    // Собираем проблемы контента по приоритетам
    const contentIssues = this.getIssuesByPrefix(categorizedIssues, 'content-');

    // Форматируем проблемы для включения в промпт
    const formattedIssues = this.formatIssuesForPrompt(contentIssues);

    // Метрики анализа контента
    const contentMetrics = JSON.stringify(contentAnalyzer.metrics, null, 2);

    // Формируем промпт для LLM
    const promptText = `
# Анализ контента веб-страницы

## URL страницы
${analysisResult.url}

## Общая оценка качества контента
${contentAnalyzer.score}/100

## Ключевые метрики
- Длина контента: ${contentAnalyzer.metrics.contentLength || 'N/A'} символов
- Уникальность контента: ${contentAnalyzer.metrics.contentUniqueness || 'N/A'}%
- Количество ключевых слов: ${contentAnalyzer.metrics.keywordCount || 'N/A'}
- Читабельность текста: ${contentAnalyzer.metrics.readabilityScore || 'N/A'}/100
- Качество форматирования: ${contentAnalyzer.metrics.formattingQuality || 'N/A'}/100
- Соотношение текста к медиа: ${contentAnalyzer.metrics.textToMediaRatio || 'N/A'}

## Выявленные проблемы
${formattedIssues}

## Детальные метрики анализа контента
\`\`\`json
${contentMetrics}
\`\`\`

## Задача для LLM
На основе приведенного выше анализа, предложите конкретные улучшения для оптимизации контента страницы:

1. Улучшение качества и уникальности текста
2. Оптимизация ключевых слов и их распределения
3. Улучшение читабельности и форматирования
4. Оптимизация заголовков и подзаголовков
5. Улучшение соотношения текста и медиа-контента
6. Добавление убедительных призывов к действию

Для каждого улучшения предоставьте:
- Конкретные примеры текста или HTML-кода для внедрения
- Обоснование, почему это улучшит качество контента
- Ожидаемый эффект на конверсию и вовлеченность

Приоритизируйте рекомендации по их потенциальному влиянию на конверсию.

Пожалуйста, представьте результаты в следующем формате для каждой рекомендации:

\`\`\`
### Рекомендация: [Краткое описание]
**Приоритет:** [Высокий/Средний/Низкий]
**Текущий контент:** [Что сейчас на странице]
**Улучшенный контент:** [Конкретный текст или HTML-код]
**Обоснование:** [Почему это улучшит качество контента]
**Ожидаемый эффект:** [Как это повлияет на конверсию и вовлеченность]
\`\`\`
`;

    return {
      id: '',
      name: 'Анализ и оптимизация контента',
      description: 'Промпт для генерации рекомендаций по улучшению контента',
      promptText,
      targetUse: 'content',
    };
  }

  /**
   * Генерирует промпт для анализа безопасности
   * @param analysisResult Результаты технического анализа
   * @param categorizedIssues Категоризированные проблемы
   */
  private generateSecurityPrompt(
    analysisResult: ITechnicalAnalysisResult,
    categorizedIssues: ICategorizedIssues,
  ): IGeneratedPrompt | null {
    const securityAnalyzer = analysisResult.analyzers['SecurityAnalyzer'];

    if (!securityAnalyzer) return null;

    // Собираем проблемы безопасности по приоритетам
    const securityIssues = this.getIssuesByPrefix(
      categorizedIssues,
      'security-',
    );

    // Форматируем проблемы для включения в промпт
    const formattedIssues = this.formatIssuesForPrompt(securityIssues);

    // Метрики анализа безопасности
    const securityMetrics = JSON.stringify(securityAnalyzer.metrics, null, 2);

    // Формируем промпт для LLM
    const promptText = `
# Анализ безопасности веб-страницы

## URL страницы
${analysisResult.url}

## Общая оценка безопасности
${securityAnalyzer.score}/100

## Ключевые метрики
- HTTPS: ${securityAnalyzer.metrics.usesHttps ? 'Да' : 'Нет'}
- Смешанный контент: ${securityAnalyzer.metrics.hasMixedContent ? 'Да' : 'Нет'}
- Заголовки безопасности: ${securityAnalyzer.metrics.securityHeaders ? 'Настроены' : 'Не настроены полностью'}

## Выявленные проблемы
${formattedIssues}

## Детальные метрики анализа безопасности
\`\`\`json
${securityMetrics}
\`\`\`

## Задача для LLM
На основе приведенного выше анализа, предложите конкретные улучшения для оптимизации безопасности страницы:

1. Устранение проблем с HTTPS
2. Исправление смешанного контента (HTTP в HTTPS)
3. Настройка заголовков безопасности (Content-Security-Policy, X-XSS-Protection и т.д.)
4. Улучшение настроек SSL/TLS
5. Устранение уязвимостей OWASP
6. Другие рекомендации по безопасности

Для каждого улучшения предоставьте:
- Конкретный код, настройки или изменения для внедрения
- Обоснование, почему это улучшит безопасность
- Ожидаемый эффект на общую безопасность сайта
- Приоритет реализации (Критический/Высокий/Средний/Низкий)

Приоритизируйте рекомендации по их потенциальному влиянию на безопасность.
Начните с критичных уязвимостей, затем перейдите к менее критичным.

Пожалуйста, представьте результаты в следующем формате для каждой рекомендации:

\`\`\`
### Рекомендация: [Краткое описание]
**Приоритет:** [Критический/Высокий/Средний/Низкий]
**Проблема:** [Описание проблемы]
**Решение:** [Конкретный код или настройки]
**Обоснование:** [Почему это улучшит безопасность]
**Ожидаемый эффект:** [Как это повлияет на общую безопасность]
\`\`\`
`;

    return {
      id: '',
      name: 'Анализ и улучшение безопасности',
      description:
        'Промпт для генерации рекомендаций по улучшению безопасности',
      promptText,
      targetUse: 'security',
    };
  }

  /**
   * Генерирует промпт для анализа конкретного типа элементов
   * @param elementType Тип элемента
   * @param elements Список элементов данного типа
   * @param analysisResult Результаты технического анализа
   */
  private generateElementPrompt(
    elementType: string,
    elements: any[],
    analysisResult: ITechnicalAnalysisResult,
  ): IGeneratedPrompt | null {
    if (!elements || elements.length === 0) return null;

    // Определяем шаблон промпта в зависимости от типа элемента
    let promptTemplate = '';
    let targetUse = '';
    let name = '';
    let description = '';

    // Подготавливаем примеры элементов (не более 5)
    const elementExamples = elements.slice(0, 5).map((el) => ({
      html: el.html,
      selector: el.selector,
      screenshot: el.screenshot,
    }));

    const elementExamplesStr = JSON.stringify(elementExamples, null, 2);

    // Определяем шаблон в зависимости от типа элемента
    if (elementType.startsWith('heading')) {
      name = 'Оптимизация заголовков';
      description = 'Промпт для генерации рекомендаций по улучшению заголовков';
      targetUse = 'headings';

      promptTemplate = `
# Анализ заголовков веб-страницы

## URL страницы
${analysisResult.url}

## Примеры заголовков на странице
\`\`\`json
${elementExamplesStr}
\`\`\`

## Задача для LLM
На основе приведенных выше примеров заголовков, предложите конкретные улучшения:

1. Оптимизация для SEO (включение ключевых слов)
2. Улучшение структуры заголовков (правильная иерархия H1-H6)
3. Повышение эффективности с точки зрения конверсии
4. Улучшение читабельности и понятности
5. Создание более привлекательных заголовков

Для каждого предложенного улучшения:
- Укажите оригинальный заголовок
- Предложите улучшенную версию
- Объясните, почему ваше предложение лучше

Приоритизируйте рекомендации по их потенциальному влиянию на конверсию и SEO.

Используйте следующий формат:

\`\`\`
### Заголовок [номер]
**Оригинал:** [оригинальный заголовок]
**Улучшенная версия:** [улучшенный заголовок]
**Обоснование:** [почему это улучшение эффективно]
**Ожидаемый эффект:** [какой эффект на SEO и конверсию]
\`\`\`
`;
    } else if (elementType.includes('cta') || elementType.includes('button')) {
      name = 'Оптимизация CTA-кнопок';
      description =
        'Промпт для генерации рекомендаций по улучшению призывов к действию';
      targetUse = 'cta-buttons';

      promptTemplate = `
# Анализ CTA-кнопок на веб-странице

## URL страницы
${analysisResult.url}

## Примеры CTA-кнопок на странице
\`\`\`json
${elementExamplesStr}
\`\`\`

## Задача для LLM
На основе приведенных выше примеров CTA-кнопок, предложите конкретные улучшения для увеличения конверсии:

1. Создание более убедительных текстов кнопок
2. Улучшение дизайна и внешнего вида кнопок (цвет, размер, расположение)
3. Добавление элементов срочности или ограниченности предложения
4. Оптимизация размещения кнопок в контексте страницы
5. Улучшение контраста и заметности

Для каждого предложенного улучшения:
- Покажите оригинальную кнопку (HTML)
- Предложите улучшенную версию (HTML и CSS)
- Объясните, почему ваше предложение лучше с точки зрения конверсии

Используйте следующий формат:

\`\`\`
### CTA-кнопка [номер]
**Оригинал:** [оригинальный HTML-код]
**Улучшенная версия:** 
\`\`\`html
[улучшенный HTML и CSS код]
\`\`\`
**Обоснование:** [почему это улучшение увеличит конверсию]
**Ожидаемый эффект:** [какой эффект на конверсию]
\`\`\`

Обратите особое внимание на психологические триггеры, которые мотивируют пользователей к действию.
`;
    } else if (elementType.includes('form')) {
      name = 'Оптимизация форм';
      description = 'Промпт для генерации рекомендаций по улучшению форм';
      targetUse = 'forms';

      promptTemplate = `
# Анализ форм на веб-странице

## URL страницы
${analysisResult.url}

## Примеры форм на странице
\`\`\`json
${elementExamplesStr}
\`\`\`

## Задача для LLM
На основе приведенных выше примеров форм, предложите конкретные улучшения для увеличения конверсии:

1. Упрощение форм и сокращение количества полей
2. Улучшение подписей и плейсхолдеров
3. Добавление подсказок и валидации
4. Улучшение дизайна и юзабилити
5. Оптимизация кнопки отправки
6. Добавление элементов доверия и безопасности

Для каждого предложенного улучшения:
- Покажите оригинальную форму (HTML)
- Предложите улучшенную версию (HTML и CSS)
- Объясните, почему ваше предложение лучше с точки зрения конверсии

Используйте следующий формат:

\`\`\`
### Форма [номер]
**Оригинал:** [оригинальный HTML-код]
**Улучшенная версия:** 
\`\`\`html
[улучшенный HTML и CSS код]
\`\`\`
**Обоснование:** [почему это улучшение увеличит конверсию]
**Рекомендуемые изменения:**
1. [Изменение 1]
2. [Изменение 2]
...
\`\`\`

Обратите особое внимание на психологию пользователей и снижение трения при заполнении форм.
`;
    } else if (
      elementType.includes('navigation') ||
      elementType.includes('menu')
    ) {
      name = 'Оптимизация навигации';
      description = 'Промпт для генерации рекомендаций по улучшению навигации';
      targetUse = 'navigation';

      promptTemplate = `
# Анализ навигации на веб-странице

## URL страницы
${analysisResult.url}

## Примеры навигационных элементов на странице
\`\`\`json
${elementExamplesStr}
\`\`\`

## Задача для LLM
На основе приведенных выше примеров навигационных элементов, предложите конкретные улучшения для улучшения пользовательского опыта и конверсии:

1. Улучшение структуры и порядка пунктов меню
2. Оптимизация визуального дизайна
3. Добавление микровзаимодействий (ховер-эффекты и т.д.)
4. Улучшение мобильной навигации
5. Оптимизация для улучшения SEO
6. Применение современных паттернов навигации

Для каждого предложенного улучшения:
- Покажите оригинальную навигацию
- Предложите улучшенную версию (HTML и CSS)
- Объясните, почему ваше предложение лучше

Используйте следующий формат:

\`\`\`
### Навигация [номер]
**Оригинал:** [оригинальный HTML-код]
**Улучшенная версия:** 
\`\`\`html
[улучшенный HTML и CSS код]
\`\`\`
**Обоснование:** [почему это улучшение улучшит пользовательский опыт]
**Ожидаемый эффект:** [какой эффект на конверсию и юзабилити]
\`\`\`
`;
    } else {
      // Общий шаблон для других типов элементов
      name = `Оптимизация элементов типа ${elementType}`;
      description = `Промпт для генерации рекомендаций по улучшению элементов типа ${elementType}`;
      targetUse = elementType.replace(/[^a-z0-9]/gi, '-').toLowerCase();

      promptTemplate = `
# Анализ элементов типа "${elementType}" на веб-странице

## URL страницы
${analysisResult.url}

## Примеры элементов
\`\`\`json
${elementExamplesStr}
\`\`\`

## Задача для LLM
На основе приведенных выше примеров элементов типа "${elementType}", предложите конкретные улучшения для увеличения конверсии и улучшения пользовательского опыта:

1. Улучшение содержания и текста
2. Оптимизация дизайна и визуального представления
3. Улучшение для SEO (если применимо)
4. Оптимизация для мобильных устройств
5. Повышение доступности (accessibility)

Для каждого предложенного улучшения:
- Покажите оригинальный элемент
- Предложите улучшенную версию (HTML и CSS)
- Объясните, почему ваше предложение лучше

Используйте следующий формат:

\`\`\`
### Элемент [номер]
**Оригинал:** [оригинальный HTML-код]
**Улучшенная версия:** 
\`\`\`html
[улучшенный HTML и CSS код]
\`\`\`
**Обоснование:** [почему это улучшение будет эффективно]
**Ожидаемый эффект:** [какой эффект на конверсию, юзабилити или SEO]
\`\`\`
`;
    }

    return {
      id: '',
      name,
      description,
      promptText: promptTemplate,
      targetUse,
    };
  }

  /**
   * Генерирует общий промпт с обзором всех проблем и рекомендаций
   * @param analysisResult Результаты технического анализа
   * @param categorizedIssues Категоризированные проблемы
   * @param pageScan Данные о сканировании страницы
   */
  private generateGeneralPrompt(
    analysisResult: ITechnicalAnalysisResult,
    categorizedIssues: ICategorizedIssues,
    pageScan: any,
  ): IGeneratedPrompt {
    // Общее количество проблем по категориям
    const criticalCount = categorizedIssues.critical.length;
    const majorCount = categorizedIssues.major.length;
    const moderateCount = categorizedIssues.moderate.length;
    const minorCount = categorizedIssues.minor.length;
    const infoCount = categorizedIssues.info.length;

    // Общее количество проблем
    const totalCount =
      criticalCount + majorCount + moderateCount + minorCount + infoCount;

    // Форматируем топ-5 критических и важных проблем
    const topIssues = [
      ...categorizedIssues.critical,
      ...categorizedIssues.major,
    ]
      .slice(0, 5)
      .map(
        (issue, index) =>
          `${index + 1}. **${issue.message}** (${issue.severity}, ${issue.analyzerName})`,
      )
      .join('\n');

    // Формируем общий промпт
    const promptText = `
# Комплексный анализ веб-страницы

## URL страницы
${analysisResult.url}

## Общая оценка
${analysisResult.overallScore}/100

## Сводка проблем
- Критические проблемы: ${criticalCount}
- Важные проблемы: ${majorCount}
- Умеренные проблемы: ${moderateCount}
- Незначительные проблемы: ${minorCount}
- Информационные замечания: ${infoCount}
- Всего проблем: ${totalCount}

## Топ проблемы, требующие внимания
${topIssues || 'Критических проблем не обнаружено'}

## Задача для LLM
На основе проведенного технического анализа, составьте комплексный план улучшения веб-страницы. 
Ваша задача - предложить приоритизированный список рекомендаций, который поможет владельцу сайта 
значительно улучшить конверсию, пользовательский опыт и SEO.

Предоставьте:

1. Краткую сводку о текущем состоянии сайта (сильных и слабых сторонах)
2. Приоритизированный план улучшений с четкими временными рамками:
   - Немедленные действия (решение критических проблем)
   - Краткосрочные улучшения (1-2 недели)
   - Среднесрочные улучшения (1-2 месяца)
   - Долгосрочные улучшения (3+ месяцев)
3. Для каждого действия укажите:
   - Описание проблемы
   - Предлагаемое решение
   - Ожидаемый эффект (высокий/средний/низкий)
   - Примерную сложность внедрения (высокая/средняя/низкая)
4. Рекомендации по оценке эффективности внедренных изменений

Сфокусируйтесь на изменениях, которые будут иметь наибольшее влияние на конверсию, 
организуя их по потенциальному влиянию и сложности реализации.

Пожалуйста, представьте результаты в следующем формате:

\`\`\`
## Текущее состояние сайта
[Краткая сводка о текущем состоянии]

## Приоритезированный план улучшений

### Немедленные действия (срочные улучшения)
1. **[Название улучшения]**
   - **Проблема:** [Описание]
   - **Решение:** [Конкретное предложение]
   - **Ожидаемый эффект:** [Высокий/Средний/Низкий]
   - **Сложность реализации:** [Высокая/Средняя/Низкая]

### Краткосрочные улучшения (1-2 недели)
...

### Среднесрочные улучшения (1-2 месяца)
...

### Долгосрочные улучшения (3+ месяцев)
...

## Рекомендации по оценке эффективности
[Рекомендации по метрикам и способам оценки изменений]
\`\`\`
`;

    return {
      id: '',
      name: 'Комплексный план улучшений',
      description: 'Стратегический план оптимизации веб-страницы',
      promptText,
      targetUse: 'general',
    };
  }

  /**
   * Фильтрует проблемы по префиксу кода
   * @param categorizedIssues Категоризированные проблемы
   * @param prefix Префикс кода проблемы
   */
  private getIssuesByPrefix(
    categorizedIssues: ICategorizedIssues,
    prefix: string,
  ): { severity: IssueSeverity; issues: IAnalysisIssue[] }[] {
    const result: { severity: IssueSeverity; issues: IAnalysisIssue[] }[] = [];

    const severities: IssueSeverity[] = [
      'critical',
      'major',
      'moderate',
      'minor',
      'info',
    ];

    for (const severity of severities) {
      const issues = categorizedIssues[severity].filter((issue) =>
        issue.code.startsWith(prefix),
      );

      if (issues.length > 0) {
        result.push({ severity, issues });
      }
    }

    return result;
  }

  /**
   * Форматирует проблемы для включения в промпт
   * @param issuesBySeverity Проблемы, отсортированные по серьезности
   */
  private formatIssuesForPrompt(
    issuesBySeverity: { severity: IssueSeverity; issues: IAnalysisIssue[] }[],
  ): string {
    if (issuesBySeverity.length === 0) {
      return 'Значимых проблем не обнаружено.';
    }

    const severityEmoji = {
      critical: '🔴',
      major: '🟠',
      moderate: '🟡',
      minor: '🔵',
      info: 'ℹ️',
    } as const;

    const formattedSections = issuesBySeverity.map(({ severity, issues }) => {
      const issuesList = issues
        .map((issue) => {
          const recommendations = issue.recommendations
            ? `\n   Рекомендации: ${issue.recommendations.join(', ')}`
            : '';

          return `${severityEmoji[severity]} ${issue.message}${recommendations}`;
        })
        .join('\n');

      return `### ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${issues.length})\n${issuesList}`;
    });

    return formattedSections.join('\n\n');
  }

  /**
   * Сохраняет промпты в базу данных
   * @param scanId ID сканирования
   * @param prompts Промпты для сохранения
   */
  private async savePromptsToDatabase(
    scanId: string,
    prompts: IGeneratedPrompt[],
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        prompts.map((prompt) =>
          this.prisma.prompt.create({
            data: {
              name: prompt.name,
              description: prompt.description,
              promptText: prompt.promptText,
              targetUse: prompt.targetUse,
              pageScanId: scanId,
            },
          }),
        ),
      );

      this.logger.log(`Saved ${prompts.length} prompts for scan ${scanId}`);
    } catch (error) {
      this.logger.error(
        `Error saving prompts to database: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Получает сохраненные промпты для сканирования
   * @param scanId ID сканирования
   */
  public async getPromptsByScanId(scanId: string): Promise<IGeneratedPrompt[]> {
    try {
      const prompts = await this.prisma.prompt.findMany({
        where: { pageScanId: scanId },
      });

      return prompts.map((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        description: prompt.description || '',
        promptText: prompt.promptText,
        targetUse: prompt.targetUse,
      }));
    } catch (error) {
      this.logger.error(`Error getting prompts: ${error.message}`, error.stack);
      throw error;
    }
  }
}
