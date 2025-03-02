import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import { ScreenshotService } from './screenshot.service';

// Интерфейс для структуры данных об элементе
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
   * @param page Объект страницы Playwright
   * @param scanId ID сканирования
   */
  async extractElements(page: Page, scanId: string): Promise<ElementData[]> {
    this.logger.log('Извлечение элементов из страницы');

    // Извлекаем различные типы элементов
    const headings = await this.extractHeadings(page, scanId);
    const ctaButtons = await this.extractCTAButtons(page, scanId);
    const forms = await this.extractForms(page, scanId);
    const contentBlocks = await this.extractContentBlocks(page, scanId);
    const navigationElements = await this.extractNavigationElements(
      page,
      scanId,
    );
    const images = await this.extractImages(page, scanId);
    const socialProofs = await this.extractSocialProofs(page, scanId);
    const footerElements = await this.extractFooterElements(page, scanId);

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
    const elementsWithHierarchy = await this.determineHierarchy(
      page,
      allElements,
    );

    // Для каждого элемента создаем скриншот
    const elementsWithScreenshots = await this.createElementScreenshots(
      page,
      elementsWithHierarchy,
      scanId,
    );

    return elementsWithScreenshots;
  }

  /**
   * Извлекает заголовки (h1-h6) со страницы
   */
  private async extractHeadings(
    page: Page,
    scanId: string,
  ): Promise<ElementData[]> {
    const headingElements: ElementData[] = [];

    // Извлекаем h1-h6 элементы
    for (let i = 1; i <= 6; i++) {
      const headings = await page.$$(`h${i}`);

      for (let j = 0; j < headings.length; j++) {
        const heading = headings[j];
        const isVisible = await heading.isVisible();

        if (!isVisible) continue;

        const html = await heading.evaluate((el) => el.outerHTML);
        const selector = await this.generateUniqueSelector(page, heading);
        const text = await heading.evaluate(
          (el) => el.textContent?.trim() || '',
        );

        if (text) {
          const boundingBox = await heading.boundingBox();

          headingElements.push({
            type: `heading-h${i}`,
            html,
            selector,
            hierarchyLevel: i,
            boundingBox: boundingBox
              ? {
                  x: boundingBox.x,
                  y: boundingBox.y,
                  width: boundingBox.width,
                  height: boundingBox.height,
                }
              : undefined,
          });
        }
      }
    }

    return headingElements;
  }

  /**
   * Извлекает CTA кнопки со страницы
   */
  private async extractCTAButtons(
    page: Page,
    scanId: string,
  ): Promise<ElementData[]> {
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

    for (const selector of buttonSelectors) {
      const buttons = await page.$$(selector);

      for (const button of buttons) {
        const isVisible = await button.isVisible();
        if (!isVisible) continue;

        const html = await button.evaluate((el) => el.outerHTML);
        const buttonText = await button.evaluate(
          (el) => el.textContent?.trim() || '',
        );
        const uniqueSelector = await this.generateUniqueSelector(page, button);

        // Определяем, является ли элемент CTA-кнопкой
        const isCTA = await this.isCTAButton(button, buttonText, html);

        if (isCTA) {
          const boundingBox = await button.boundingBox();

          ctaElements.push({
            type: 'cta-button',
            html,
            selector: uniqueSelector,
            hierarchyLevel: 2, // Уровень по умолчанию, будет обновлен позже
            boundingBox: boundingBox
              ? {
                  x: boundingBox.x,
                  y: boundingBox.y,
                  width: boundingBox.width,
                  height: boundingBox.height,
                }
              : undefined,
          });
        }
      }
    }

    return ctaElements;
  }

  /**
   * Определяет, является ли элемент CTA-кнопкой
   */
  private async isCTAButton(
    button,
    text: string,
    html: string,
  ): Promise<boolean> {
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

    // Проверяем CSS-свойства
    const hasButtonStyles = await button.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      // Проверяем характерные для кнопок стили
      const hasBackground =
        styles.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        styles.backgroundColor !== 'transparent';
      const hasBorder =
        styles.border !== 'none' && styles.border !== '0px none rgb(0, 0, 0)';
      const hasPadding =
        parseInt(styles.paddingLeft) > 0 && parseInt(styles.paddingRight) > 0;
      const hasDistinctiveDisplay =
        styles.display === 'inline-block' || styles.display === 'flex';

      return (
        hasBackground || (hasBorder && hasPadding) || hasDistinctiveDisplay
      );
    });

    return containsPhrase || (hasButtonClass && hasButtonStyles);
  }

  /**
   * Извлекает формы со страницы
   */
  private async extractForms(
    page: Page,
    scanId: string,
  ): Promise<ElementData[]> {
    const formElements: ElementData[] = [];

    const forms = await page.$$('form');

    for (const form of forms) {
      const isVisible = await form.isVisible();
      if (!isVisible) continue;

      const html = await form.evaluate((el) => el.outerHTML);
      const uniqueSelector = await this.generateUniqueSelector(page, form);
      const boundingBox = await form.boundingBox();

      formElements.push({
        type: 'form',
        html,
        selector: uniqueSelector,
        hierarchyLevel: 2, // Уровень по умолчанию, будет обновлен позже
        boundingBox: boundingBox
          ? {
              x: boundingBox.x,
              y: boundingBox.y,
              width: boundingBox.width,
              height: boundingBox.height,
            }
          : undefined,
      });

      // Также извлекаем поля формы
      const formFields = await this.extractFormFields(
        page,
        form,
        uniqueSelector,
      );
      formElements.push(...formFields);
    }

    return formElements;
  }

  /**
   * Извлекает поля формы
   */
  private async extractFormFields(
    page: Page,
    formElement,
    formSelector: string,
  ): Promise<ElementData[]> {
    const fieldElements: ElementData[] = [];

    // Селекторы для полей формы
    const fieldSelectors = ['input:not([type="hidden"])', 'select', 'textarea'];

    for (const selector of fieldSelectors) {
      const fields = await formElement.$$(selector);

      for (const field of fields) {
        const isVisible = await field.isVisible();
        if (!isVisible) continue;

        const html = await field.evaluate((el) => el.outerHTML);
        const uniqueSelector = await this.generateUniqueSelector(page, field);
        const fieldType = await field.evaluate(
          (el) => el.getAttribute('type') || el.tagName.toLowerCase(),
        );
        const boundingBox = await field.boundingBox();

        fieldElements.push({
          type: `form-field-${fieldType}`,
          html,
          selector: uniqueSelector,
          hierarchyLevel: 3, // Поля формы на уровень ниже самой формы
          parentSelector: formSelector,
          boundingBox: boundingBox
            ? {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height,
              }
            : undefined,
        });
      }
    }

    return fieldElements;
  }

  /**
   * Извлекает контентные блоки со страницы
   */
  private async extractContentBlocks(
    page: Page,
    scanId: string,
  ): Promise<ElementData[]> {
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

    for (const selector of contentSelectors) {
      const blocks = await page.$$(selector);

      for (const block of blocks) {
        const isVisible = await block.isVisible();
        if (!isVisible) continue;

        const html = await block.evaluate((el) => el.outerHTML);
        const uniqueSelector = await this.generateUniqueSelector(page, block);

        // Включаем только если блок содержит существенный контент
        const text = await block.evaluate((el) => el.textContent?.trim() || '');
        const hasChildren = await block.evaluate(
          (el) => el.children.length > 0,
        );

        if (
          (text.length > 50 || hasChildren) &&
          !html.includes('<header') &&
          !html.includes('<footer')
        ) {
          const boundingBox = await block.boundingBox();

          contentElements.push({
            type: 'content-block',
            html,
            selector: uniqueSelector,
            hierarchyLevel: 2, // Уровень по умолчанию, будет обновлен позже
            boundingBox: boundingBox
              ? {
                  x: boundingBox.x,
                  y: boundingBox.y,
                  width: boundingBox.width,
                  height: boundingBox.height,
                }
              : undefined,
          });
        }
      }
    }

    return contentElements;
  }

  /**
   * Извлекает навигационные элементы со страницы
   */
  private async extractNavigationElements(
    page: Page,
    scanId: string,
  ): Promise<ElementData[]> {
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

    for (const selector of navSelectors) {
      const navs = await page.$$(selector);

      for (const nav of navs) {
        const isVisible = await nav.isVisible();
        if (!isVisible) continue;

        const html = await nav.evaluate((el) => el.outerHTML);
        const uniqueSelector = await this.generateUniqueSelector(page, nav);
        const boundingBox = await nav.boundingBox();

        navElements.push({
          type: 'navigation',
          html,
          selector: uniqueSelector,
          hierarchyLevel: 1, // Навигация обычно на верхнем уровне
          boundingBox: boundingBox
            ? {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height,
              }
            : undefined,
        });

        // Также извлекаем навигационные ссылки
        const navLinks = await this.extractNavigationLinks(
          page,
          nav,
          uniqueSelector,
        );
        navElements.push(...navLinks);
      }
    }

    return navElements;
  }

  /**
   * Извлекает навигационные ссылки
   */
  private async extractNavigationLinks(
    page: Page,
    navElement,
    navSelector: string,
  ): Promise<ElementData[]> {
    const linkElements: ElementData[] = [];

    const links = await navElement.$$('a');

    for (const link of links) {
      const isVisible = await link.isVisible();
      if (!isVisible) continue;

      const html = await link.evaluate((el) => el.outerHTML);
      const uniqueSelector = await this.generateUniqueSelector(page, link);
      const text = await link.evaluate((el) => el.textContent?.trim() || '');
      const href = await link.evaluate((el) => el.getAttribute('href') || '');

      if (text) {
        const boundingBox = await link.boundingBox();

        linkElements.push({
          type: 'navigation-link',
          html,
          selector: uniqueSelector,
          hierarchyLevel: 2, // Ссылки на уровень ниже навигации
          parentSelector: navSelector,
          boundingBox: boundingBox
            ? {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height,
              }
            : undefined,
        });
      }
    }

    return linkElements;
  }

  /**
   * Извлекает изображения со страницы
   */
  private async extractImages(
    page: Page,
    scanId: string,
  ): Promise<ElementData[]> {
    const imageElements: ElementData[] = [];

    const images = await page.$$('img');

    for (const image of images) {
      const isVisible = await image.isVisible();
      const src = await image.evaluate((el) => el.getAttribute('src'));

      if (isVisible && src) {
        const html = await image.evaluate((el) => el.outerHTML);
        const uniqueSelector = await this.generateUniqueSelector(page, image);
        const alt = await image.evaluate((el) => el.getAttribute('alt') || '');
        const boundingBox = await image.boundingBox();

        if (boundingBox && boundingBox.width > 50 && boundingBox.height > 50) {
          imageElements.push({
            type: 'image',
            html,
            selector: uniqueSelector,
            hierarchyLevel: 3, // Изображения обычно вложены в контент
            boundingBox: {
              x: boundingBox.x,
              y: boundingBox.y,
              width: boundingBox.width,
              height: boundingBox.height,
            },
          });
        }
      }
    }

    return imageElements;
  }

  /**
   * Извлекает блоки с социальными доказательствами (отзывы, рейтинги и т.д.)
   */
  private async extractSocialProofs(
    page: Page,
    scanId: string,
  ): Promise<ElementData[]> {
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

    for (const selector of socialProofSelectors) {
      const elements = await page.$$(selector);

      for (const element of elements) {
        const isVisible = await element.isVisible();
        if (!isVisible) continue;

        const html = await element.evaluate((el) => el.outerHTML);
        const uniqueSelector = await this.generateUniqueSelector(page, element);
        const boundingBox = await element.boundingBox();

        socialProofElements.push({
          type: 'social-proof',
          html,
          selector: uniqueSelector,
          hierarchyLevel: 2, // Уровень по умолчанию, будет обновлен позже
          boundingBox: boundingBox
            ? {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height,
              }
            : undefined,
        });
      }
    }

    return socialProofElements;
  }

  /**
   * Извлекает элементы подвала (футера) страницы
   */
  private async extractFooterElements(
    page: Page,
    scanId: string,
  ): Promise<ElementData[]> {
    const footerElements: ElementData[] = [];

    // Селекторы для футера
    const footerSelectors = [
      'footer',
      '.footer',
      '#footer',
      '[role="contentinfo"]',
    ];

    for (const selector of footerSelectors) {
      const elements = await page.$$(selector);

      for (const element of elements) {
        const isVisible = await element.isVisible();
        if (!isVisible) continue;

        const html = await element.evaluate((el) => el.outerHTML);
        const uniqueSelector = await this.generateUniqueSelector(page, element);
        const boundingBox = await element.boundingBox();

        footerElements.push({
          type: 'footer',
          html,
          selector: uniqueSelector,
          hierarchyLevel: 1, // Футер обычно на верхнем уровне
          boundingBox: boundingBox
            ? {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height,
              }
            : undefined,
        });

        // Также извлекаем контактную информацию
        const contactInfo = await this.extractContactInfo(
          page,
          element,
          uniqueSelector,
        );
        footerElements.push(...contactInfo);
      }
    }

    return footerElements;
  }

  /**
   * Извлекает контактную информацию из футера
   */
  private async extractContactInfo(
    page: Page,
    footerElement,
    footerSelector: string,
  ): Promise<ElementData[]> {
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

    for (const selector of contactSelectors) {
      const elements = await footerElement.$$(selector);

      for (const element of elements) {
        const isVisible = await element.isVisible();
        if (!isVisible) continue;

        const html = await element.evaluate((el) => el.outerHTML);
        const uniqueSelector = await this.generateUniqueSelector(page, element);
        const boundingBox = await element.boundingBox();

        contactElements.push({
          type: 'contact-info',
          html,
          selector: uniqueSelector,
          hierarchyLevel: 2, // Контактная информация на уровень ниже футера
          parentSelector: footerSelector,
          boundingBox: boundingBox
            ? {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height,
              }
            : undefined,
        });
      }
    }

    return contactElements;
  }

  /**
   * Генерирует уникальный CSS-селектор для элемента
   */
  private async generateUniqueSelector(
    page: Page,
    elementHandle,
  ): Promise<string> {
    // Генерируем уникальный селектор для элемента
    try {
      // Сначала пробуем использовать встроенный в Playwright метод
      return await page.evaluate((el) => {
        function getUniqueSelector(element) {
          if (element.id) {
            return `#${element.id}`;
          }

          // Если элемент имеет атрибут name и он уникален
          if (element.getAttribute('name')) {
            const name = element.getAttribute('name');
            const sameNameElements = document.querySelectorAll(
              `[name="${name}"]`,
            );
            if (sameNameElements.length === 1) {
              return `[name="${name}"]`;
            }
          }

          // Если у элемента есть классы, используем их
          if (element.className) {
            const classList = Array.from(element.classList).filter(Boolean);
            if (classList.length > 0) {
              const classSelector = `.${classList.join('.')}`;
              // Проверяем, что селектор уникален
              const matchingElements = document.querySelectorAll(classSelector);
              if (matchingElements.length === 1) {
                return classSelector;
              }
            }
          }

          // Если мы дошли до здесь, создаем селектор, включающий тег и родителя
          let selector = element.tagName.toLowerCase();
          let parent = element.parentElement;
          let index = Array.from(parent.children)
            .filter((child) => (child as Element).tagName === element.tagName)
            .indexOf(element);

          if (index > 0) {
            selector += `:nth-of-type(${index + 1})`;
          }

          // Если мы на верхнем уровне или дошли до body, возвращаем селектор
          if (!parent || parent === document.body) {
            return selector;
          }

          // Иначе рекурсивно вызываем для родителя и соединяем
          return `${getUniqueSelector(parent)} > ${selector}`;
        }

        return getUniqueSelector(el);
      }, elementHandle);
    } catch (error) {
      this.logger.warn(
        `Не удалось сгенерировать уникальный селектор: ${error.message}`,
      );
      // Запасной вариант для не-уникальных селекторов
      return await elementHandle.evaluate((el) => el.tagName.toLowerCase());
    }
  }

  /**
   * Определяет иерархические отношения между элементами
   */
  private async determineHierarchy(
    page: Page,
    elements: ElementData[],
  ): Promise<ElementData[]> {
    const elementsWithParents = await page.evaluate((elementsJson) => {
      const elements = JSON.parse(elementsJson);

      function isDescendant(parent, child) {
        try {
          const parentElement = document.querySelector(parent);
          const childElement = document.querySelector(child);

          if (!parentElement || !childElement) return false;

          return parentElement.contains(childElement);
        } catch {
          return false;
        }
      }

      // Строим дерево элементов
      return elements.map((element) => {
        // Ищем ближайшего предка элемента
        for (const potentialParent of elements) {
          if (
            element.selector !== potentialParent.selector &&
            isDescendant(potentialParent.selector, element.selector)
          ) {
            // Нашли предка - сохраняем ссылку на него
            element.parentSelector = potentialParent.selector;
            break;
          }
        }

        return element;
      });
    }, JSON.stringify(elements));

    // Определяем уровни иерархии
    // Элементы без родителей имеют уровень 1, их дети - 2, и так далее
    const elementsBySelector = new Map<string, ElementData>();
    elementsWithParents.forEach((el) =>
      elementsBySelector.set(el.selector, el),
    );

    // Устанавливаем уровни иерархии
    function setHierarchyLevel(element: ElementData, level: number) {
      element.hierarchyLevel = level;

      // Находим всех детей этого элемента
      elementsWithParents
        .filter((el) => el.parentSelector === element.selector)
        .forEach((child) => setHierarchyLevel(child, level + 1));
    }

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
        // Проверяем, что селектор корректный и элемент существует
        const elementHandle = await page.$(element.selector);

        if (elementHandle) {
          // Делаем скриншот элемента
          const screenshotUrl =
            await this.screenshotService.takeElementScreenshot(
              page,
              element.selector,
              scanId,
            );

          // Добавляем URL скриншота к данным элемента
          elementsWithScreenshots.push({
            ...element,
            screenshot: screenshotUrl,
          });
        } else {
          // Если не удалось найти элемент, добавляем без скриншота
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
