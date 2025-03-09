import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import { Page } from 'puppeteer';
import { ScreenshotService } from './screenshot.service';

export interface ElementData {
  type: string;
  html: string;
  selector: string;
  hierarchyLevel: number;
  parentSelector?: string;
  screenshot?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

@Injectable()
export class ElementExtractorService {
  private readonly logger = new Logger(ElementExtractorService.name);

  constructor(private screenshotService: ScreenshotService) {}

  /**
   * Извлекает все типы элементов со страницы
   * @param page Объект страницы Puppeteer
   * @param html HTML контент страницы
   * @param scanId ID сканирования
   */
  async extractElements(
    page: Page,
    html: string,
    scanId: string,
  ): Promise<ElementData[]> {
    this.logger.log('Извлечение элементов из страницы');

    // Загружаем HTML в Cheerio
    const $ = cheerio.load(html);

    // Извлекаем различные типы элементов с помощью Cheerio
    const headings = this.extractHeadings($);
    const ctaButtons = this.extractCTAButtons($);
    const forms = this.extractForms($);
    const contentBlocks = this.extractContentBlocks($);
    const navigationElements = this.extractNavigationElements($);
    const images = this.extractImages($);
    const socialProofs = this.extractSocialProofs($);
    const footerElements = this.extractFooterElements($);

    // Объединяем все элементы
    const allElements = [
      ...headings,
      ...ctaButtons,
      ...forms,
      ...contentBlocks,
      ...navigationElements,
      ...images,
      ...socialProofs,
      ...footerElements,
    ];

    // Определяем иерархические отношения между элементами
    const elementsWithHierarchy = this.determineHierarchy($, allElements);

    // Создаем скриншоты для элементов
    const elementsWithScreenshots = await this.createElementScreenshots(
      page,
      elementsWithHierarchy,
      scanId,
    );

    return elementsWithScreenshots;
  }

  /**
   * Извлекает заголовки (h1-h6) со страницы с помощью Cheerio
   */
  private extractHeadings($: cheerio.CheerioAPI | cheerio.Root): ElementData[] {
    const headingElements: ElementData[] = [];

    // Извлекаем h1-h6 элементы
    for (let i = 1; i <= 6; i++) {
      $(`h${i}`).each((index, element) => {
        // Проверяем, что элемент не пустой
        const text = $(element).text().trim();
        if (text) {
          const selector = this.generateCheerioSelector($, element);

          headingElements.push({
            type: `heading-h${i}`,
            html: $.html(element),
            selector,
            hierarchyLevel: i,
          });
        }
      });
    }

    return headingElements;
  }

  /**
   * Извлекает CTA кнопки со страницы с помощью Cheerio
   */
  private extractCTAButtons(
    $: cheerio.CheerioAPI | cheerio.Root,
  ): ElementData[] {
    const ctaElements: ElementData[] = [];

    // Селекторы для элементов, похожих на CTA-кнопки
    const buttonSelectors = [
      'button',
      'a.btn',
      'a.button',
      '.cta',
      'input[type="submit"]',
      'a[href]:not([href^="#"]):not([href^="javascript"])',
      '[role="button"]',
      '.btn',
      '.button',
    ];

    buttonSelectors.forEach((selector) => {
      $(selector).each((index, element) => {
        const html = $.html(element);
        const buttonText = $(element).text().trim();

        // Определяем, является ли элемент CTA-кнопкой
        if (this.isCTAButton($, element, buttonText, html)) {
          const uniqueSelector = this.generateCheerioSelector($, element);

          ctaElements.push({
            type: 'cta-button',
            html,
            selector: uniqueSelector,
            hierarchyLevel: 2, // Уровень по умолчанию, будет обновлен позже
          });
        }
      });
    });

    return ctaElements;
  }

  /**
   * Определяет, является ли элемент CTA-кнопкой
   */
  private isCTAButton(
    $: cheerio.CheerioAPI | cheerio.Root,
    element: cheerio.Element,
    text: string,
    html: string,
  ): boolean {
    // Проверяем наличие распространенных CTA-фраз
    const ctaPhrases = [
      'sign up',
      'регистрация',
      'зарегистрироваться',
      'subscribe',
      'подписаться',
      'подписка',
      'download',
      'скачать',
      'загрузить',
      'get started',
      'начать',
      'приступить',
      'try',
      'попробовать',
      'buy',
      'купить',
      'заказать',
      'order',
      'learn more',
      'узнать больше',
      'подробнее',
      'contact',
      'связаться',
      'контакт',
      'submit',
      'отправить',
      'отправка',
      'send',
      'послать',
      'apply',
      'применить',
      'start',
      'старт',
      'join',
      'присоединиться',
      'request',
      'запросить',
    ];

    const lowerText = text.toLowerCase();

    // Проверяем, содержит ли текст CTA-фразы
    const containsPhrase = ctaPhrases.some((phrase) =>
      lowerText.includes(phrase),
    );

    // Проверяем наличие классов, характерных для кнопок
    const hasButtonClass =
      html.includes('btn') || html.includes('button') || html.includes('cta');

    // Смотрим атрибуты, которые могут указывать на кнопку
    const elClass = $(element).attr('class') || '';
    const elRole = $(element).attr('role') || '';
    const elType = $(element).attr('type') || '';

    const hasButtonAttributes =
      elRole === 'button' ||
      elType === 'submit' ||
      elType === 'button' ||
      elClass.includes('btn') ||
      elClass.includes('button');

    return containsPhrase || hasButtonClass || hasButtonAttributes;
  }

  /**
   * Извлекает формы со страницы с помощью Cheerio
   */
  private extractForms($: cheerio.CheerioAPI | cheerio.Root): ElementData[] {
    const formElements: ElementData[] = [];

    $('form').each((index, form) => {
      const html = $.html(form);
      const uniqueSelector = this.generateCheerioSelector($, form);

      formElements.push({
        type: 'form',
        html,
        selector: uniqueSelector,
        hierarchyLevel: 2, // Уровень по умолчанию, будет обновлен позже
      });

      // Также извлекаем поля формы
      const formFields = this.extractFormFields($, form, uniqueSelector);
      formElements.push(...formFields);
    });

    return formElements;
  }

  /**
   * Извлекает поля формы с помощью Cheerio
   */
  private extractFormFields(
    $: cheerio.CheerioAPI | cheerio.Root,
    form: cheerio.Element,
    formSelector: string,
  ): ElementData[] {
    const fieldElements: ElementData[] = [];

    // Селекторы для полей формы
    const fieldSelectors = ['input:not([type="hidden"])', 'select', 'textarea'];

    fieldSelectors.forEach((selector) => {
      $(form)
        .find(selector)
        .each((index, field) => {
          const html = $.html(field);
          const uniqueSelector = this.generateCheerioSelector($, field);
          const fieldType =
            $(field).attr('type') ||
            (field as cheerio.TagElement).tagName.toLowerCase();

          fieldElements.push({
            type: `form-field-${fieldType}`,
            html,
            selector: uniqueSelector,
            hierarchyLevel: 3, // Поля формы на уровень ниже самой формы
            parentSelector: formSelector,
          });
        });
    });

    return fieldElements;
  }

  /**
   * Извлекает контентные блоки со страницы с помощью Cheerio
   */
  private extractContentBlocks(
    $: cheerio.CheerioAPI | cheerio.Root,
  ): ElementData[] {
    const contentElements: ElementData[] = [];

    // Контентные блоки часто находятся в этих контейнерах
    const contentSelectors = [
      'article',
      'section',
      '.content',
      'main',
      '[role="main"]',
      '.post',
      '.entry',
      'p:not(:empty)',
      '.card',
      '.block',
      '.container > div',
    ];

    contentSelectors.forEach((selector) => {
      $(selector).each((index, block) => {
        const html = $.html(block);
        const uniqueSelector = this.generateCheerioSelector($, block);

        // Включаем только если блок содержит существенный контент
        const text = $(block).text().trim();
        const hasChildren = $(block).children().length > 0;

        if (
          (text.length > 50 || hasChildren) &&
          !html.includes('<header') &&
          !html.includes('<footer')
        ) {
          contentElements.push({
            type: 'content-block',
            html,
            selector: uniqueSelector,
            hierarchyLevel: 2, // Уровень по умолчанию, будет обновлен позже
          });
        }
      });
    });

    return contentElements;
  }

  /**
   * Извлекает навигационные элементы со страницы с помощью Cheerio
   */
  private extractNavigationElements(
    $: cheerio.CheerioAPI | cheerio.Root,
  ): ElementData[] {
    const navElements: ElementData[] = [];

    // Навигационные элементы обычно используют эти селекторы
    const navSelectors = [
      'nav',
      'header',
      'menu',
      '[role="navigation"]',
      '.navigation',
      '.navbar',
      '.menu',
      '.main-menu',
      '.nav',
      '.top-menu',
    ];

    navSelectors.forEach((selector) => {
      $(selector).each((index, nav) => {
        const html = $.html(nav);
        const uniqueSelector = this.generateCheerioSelector($, nav);

        navElements.push({
          type: 'navigation',
          html,
          selector: uniqueSelector,
          hierarchyLevel: 1, // Навигация обычно на верхнем уровне
        });

        // Также извлекаем навигационные ссылки
        const navLinks = this.extractNavigationLinks($, nav, uniqueSelector);
        navElements.push(...navLinks);
      });
    });

    return navElements;
  }

  /**
   * Извлекает навигационные ссылки с помощью Cheerio
   */
  private extractNavigationLinks(
    $: cheerio.CheerioAPI | cheerio.Root,
    navElement: cheerio.Element,
    navSelector: string,
  ): ElementData[] {
    const linkElements: ElementData[] = [];

    $(navElement)
      .find('a')
      .each((index, link) => {
        const html = $.html(link);
        const uniqueSelector = this.generateCheerioSelector($, link);
        const text = $(link).text().trim();

        if (text) {
          linkElements.push({
            type: 'navigation-link',
            html,
            selector: uniqueSelector,
            hierarchyLevel: 2, // Ссылки на уровень ниже навигации
            parentSelector: navSelector,
          });
        }
      });

    return linkElements;
  }

  /**
   * Извлекает изображения со страницы с помощью Cheerio
   */
  private extractImages($: cheerio.CheerioAPI | cheerio.Root): ElementData[] {
    const imageElements: ElementData[] = [];

    $('img').each((index, image) => {
      const src = $(image).attr('src');

      if (src) {
        const html = $.html(image);
        const uniqueSelector = this.generateCheerioSelector($, image);

        // Проверяем размеры изображения по атрибутам
        const width = parseInt($(image).attr('width') || '0', 10);
        const height = parseInt($(image).attr('height') || '0', 10);

        // Если есть размеры в атрибутах и они достаточные, или если это просто изображение со src
        if ((width > 50 && height > 50) || (!width && !height)) {
          imageElements.push({
            type: 'image',
            html,
            selector: uniqueSelector,
            hierarchyLevel: 3, // Изображения обычно вложены в контент
          });
        }
      }
    });

    return imageElements;
  }

  /**
   * Извлекает блоки с социальными доказательствами с помощью Cheerio
   */
  private extractSocialProofs(
    $: cheerio.CheerioAPI | cheerio.Root,
  ): ElementData[] {
    const socialProofElements: ElementData[] = [];

    // Селекторы для блоков с социальными доказательствами
    const socialProofSelectors = [
      '.testimonial',
      '.review',
      '.rating',
      '.stars',
      '.feedback',
      '.client',
      '.customer',
      '[class*="testimonial"]',
      '[class*="review"]',
      '[class*="rating"]',
    ];

    socialProofSelectors.forEach((selector) => {
      $(selector).each((index, element) => {
        const html = $.html(element);
        const uniqueSelector = this.generateCheerioSelector($, element);

        socialProofElements.push({
          type: 'social-proof',
          html,
          selector: uniqueSelector,
          hierarchyLevel: 2, // Уровень по умолчанию, будет обновлен позже
        });
      });
    });

    return socialProofElements;
  }

  /**
   * Извлекает элементы подвала (футера) страницы с помощью Cheerio
   */
  private extractFooterElements(
    $: cheerio.CheerioAPI | cheerio.Root,
  ): ElementData[] {
    const footerElements: ElementData[] = [];

    // Селекторы для футера
    const footerSelectors = [
      'footer',
      '.footer',
      '#footer',
      '[role="contentinfo"]',
    ];

    footerSelectors.forEach((selector) => {
      $(selector).each((index, element) => {
        const html = $.html(element);
        const uniqueSelector = this.generateCheerioSelector($, element);

        footerElements.push({
          type: 'footer',
          html,
          selector: uniqueSelector,
          hierarchyLevel: 1, // Футер обычно на верхнем уровне
        });

        // Также извлекаем контактную информацию
        const contactInfo = this.extractContactInfo($, element, uniqueSelector);
        footerElements.push(...contactInfo);
      });
    });

    return footerElements;
  }

  /**
   * Извлекает контактную информацию из футера с помощью Cheerio
   */
  private extractContactInfo(
    $: cheerio.CheerioAPI | cheerio.Root,
    footerElement: cheerio.Element,
    footerSelector: string,
  ): ElementData[] {
    const contactElements: ElementData[] = [];

    // Селекторы для контактной информации
    const contactSelectors = [
      'address',
      '.contact',
      '.contact-info',
      '.phone',
      '.email',
      'a[href^="tel:"]',
      'a[href^="mailto:"]',
    ];

    contactSelectors.forEach((selector) => {
      $(footerElement)
        .find(selector)
        .each((index, element) => {
          const html = $.html(element);
          const uniqueSelector = this.generateCheerioSelector($, element);

          contactElements.push({
            type: 'contact-info',
            html,
            selector: uniqueSelector,
            hierarchyLevel: 2, // Контактная информация на уровень ниже футера
            parentSelector: footerSelector,
          });
        });
    });

    return contactElements;
  }

  /**
   * Генерирует CSS-селектор для элемента с помощью Cheerio
   */
  private generateCheerioSelector(
    $: cheerio.CheerioAPI | cheerio.Root,
    element: cheerio.Element,
  ): string {
    try {
      // Если есть id, используем его
      const id = $(element).attr('id');
      if (id) {
        return `#${id}`;
      }

      // Если есть name, проверяем его уникальность
      const name = $(element).attr('name');
      if (name) {
        if ($(element).length === 1) {
          return `[name="${name}"]`;
        }
      }

      // Пробуем использовать классы
      const classes = $(element).attr('class');
      if (classes) {
        const classSelector = '.' + classes.split(/\s+/).join('.');
        if ($(classSelector).length === 1) {
          return classSelector;
        }
      }

      // Генерируем селектор на основе тега и позиции среди сиблингов
      const tagName = (element as cheerio.TagElement).tagName.toLowerCase();
      const parent = element.parent;
      const siblings = $(parent).children(tagName);

      // Если элемент единственный такого типа у родителя
      if (siblings.length === 1) {
        // Если родитель - body, просто возвращаем тег
        if (parent && (parent as cheerio.TagElement).tagName === 'body') {
          return tagName;
        }

        // Иначе рекурсивно строим селектор для родителя
        const parentSelector = this.generateCheerioSelector($, parent);
        return `${parentSelector} > ${tagName}`;
      }

      // Если элемент не единственный, добавляем :nth-child
      const index = siblings.toArray().indexOf(element) + 1;

      // Если родитель - body, просто возвращаем тег с nth-child
      if (parent && (parent as cheerio.TagElement).tagName === 'body') {
        return `${tagName}:nth-child(${index})`;
      }

      // Иначе рекурсивно строим селектор для родителя
      const parentSelector = this.generateCheerioSelector($, parent);
      return `${parentSelector} > ${tagName}:nth-child(${index})`;
    } catch (error) {
      this.logger.warn(
        `Не удалось сгенерировать уникальный селектор: ${error.message}`,
      );
      // Запасной вариант - хэш содержимого
      const content = $.html(element);
      const hash = crypto
        .createHash('md5')
        .update(content)
        .digest('hex')
        .substring(0, 8);
      return `[data-gen-selector="${hash}"]`;
    }
  }

  /**
   * Определяет иерархические отношения между элементами
   */
  private determineHierarchy(
    $: cheerio.CheerioAPI | cheerio.Root,
    elements: ElementData[],
  ): ElementData[] {
    const elementsWithParents = [...elements];

    // Строим дерево элементов
    for (const element of elementsWithParents) {
      // Если уже есть родитель, пропускаем
      if (element.parentSelector) continue;

      // Ищем ближайшего предка элемента
      for (const potentialParent of elements) {
        // Пропускаем сам элемент и элементы с уже определенными родителями
        if (element.selector === potentialParent.selector) continue;

        // Проверяем, содержит ли потенциальный родитель наш элемент
        try {
          const isDescendant =
            $(element.selector).parents(potentialParent.selector).length > 0;

          if (isDescendant) {
            // Нашли предка - сохраняем ссылку на него
            element.parentSelector = potentialParent.selector;
            break;
          }
        } catch (error) {
          // Игнорируем ошибки селекторов
          continue;
        }
      }
    }

    // Создаем карту элементов по селекторам для быстрого доступа
    const elementsBySelector = new Map<string, ElementData>();
    elementsWithParents.forEach((el) =>
      elementsBySelector.set(el.selector, el),
    );

    // Устанавливаем уровни иерархии
    const setHierarchyLevel = (element: ElementData, level: number) => {
      element.hierarchyLevel = level;

      // Находим всех детей этого элемента
      elementsWithParents
        .filter((el) => el.parentSelector === element.selector)
        .forEach((child) => setHierarchyLevel(child, level + 1));
    };

    // Начинаем с элементов верхнего уровня (без родителей)
    elementsWithParents
      .filter((el) => !el.parentSelector)
      .forEach((el) => setHierarchyLevel(el, 1));

    return elementsWithParents;
  }

  /**
   * Создает скриншоты для каждого элемента
   */
  private async createElementScreenshots(
    page: Page,
    elements: ElementData[],
    scanId: string,
  ): Promise<ElementData[]> {
    const elementsWithScreenshots: ElementData[] = [];

    for (const element of elements) {
      try {
        // Получаем ограничивающий прямоугольник элемента
        const boundingBox = await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;

          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }, element.selector);

        if (boundingBox) {
          element.boundingBox = boundingBox;

          // Делаем скриншот элемента
          const screenshotUrl =
            await this.screenshotService.takeElementScreenshot(
              page,
              element.selector,
              scanId,
              boundingBox,
            );

          // Добавляем URL скриншота к данным элемента
          elementsWithScreenshots.push({
            ...element,
            screenshot: screenshotUrl,
          });
        } else {
          // Если не удалось получить boundingBox, добавляем без скриншота
          elementsWithScreenshots.push(element);
        }
      } catch (error) {
        this.logger.warn(
          `Не удалось создать скриншот для элемента: ${error.message}`,
        );
        elementsWithScreenshots.push(element);
      }
    }

    return elementsWithScreenshots;
  }
}
