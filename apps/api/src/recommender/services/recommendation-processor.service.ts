import { Injectable, Logger } from '@nestjs/common';
import {
  IRecommendation,
  IRecommenderResponse,
} from '../interfaces/recommender.interface';

@Injectable()
export class RecommendationProcessorService {
  private readonly logger = new Logger(RecommendationProcessorService.name);

  /**
   * Processes the raw response from OpenAI API and converts it to structured data
   */
  async processResponse(rawResponse: string): Promise<IRecommenderResponse> {
    try {
      // Try to parse the response as JSON
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(rawResponse);
      } catch (e) {
        this.logger.warn(
          'Failed to parse response as JSON, attempting fallback parsing',
        );
        parsedResponse = this.fallbackParsing(rawResponse);
      }

      // Extract recommendations from the parsed response
      const recommendations = this.extractRecommendations(parsedResponse);

      return {
        recommendations,
        rawResponse,
      };
    } catch (error) {
      this.logger.error(
        `Error processing LLM response: ${error.message}`,
        error.stack,
      );
      return {
        recommendations: [],
        rawResponse,
      };
    }
  }

  /**
   * Extracts structured recommendations from the parsed response
   */
  private extractRecommendations(parsedResponse: any): IRecommendation[] {
    const recommendations: IRecommendation[] = [];

    // Handle different response formats
    if (Array.isArray(parsedResponse.recommendations)) {
      // If response has a recommendations array
      return parsedResponse.recommendations.map((rec) =>
        this.normalizeRecommendation(rec),
      );
    } else if (parsedResponse.recommendations) {
      // If recommendations is an object with numbered keys
      Object.values(parsedResponse.recommendations).forEach((rec) => {
        recommendations.push(this.normalizeRecommendation(rec as any));
      });
    } else {
      // Try to extract recommendations from top-level object
      Object.entries(parsedResponse).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          recommendations.push(
            this.normalizeRecommendation({
              category: key,
              ...(value as any),
            }),
          );
        }
      });
    }

    return recommendations;
  }

  /**
   * Normalizes a recommendation object to ensure it follows the expected structure
   */
  private normalizeRecommendation(rec: any): IRecommendation {
    return {
      category: rec.category || 'general',
      priority: this.normalizePriority(rec.priority),
      description: rec.description || rec.problem || '',
      solution: rec.solution || rec.recommendation || rec.change || '',
      rationale: rec.rationale || rec.reasoning || rec.justification || '',
      implementation: rec.implementation || rec.code || rec.example || '',
      expectedEffect: rec.expectedEffect || rec.impact || rec.effect || '',
    };
  }

  /**
   * Normalizes priority values to one of: 'high', 'medium', 'low'
   */
  private normalizePriority(priority: string): 'high' | 'medium' | 'low' {
    if (!priority) return 'medium';

    const lowercasePriority = priority.toLowerCase();

    if (
      lowercasePriority.includes('high') ||
      lowercasePriority.includes('critical')
    ) {
      return 'high';
    } else if (
      lowercasePriority.includes('low') ||
      lowercasePriority.includes('minor')
    ) {
      return 'low';
    } else {
      return 'medium';
    }
  }

  /**
   * Fallback parsing for when the response is not valid JSON
   */
  private fallbackParsing(rawResponse: string): any {
    const recommendations: any[] = [];
    let currentRecommendation: any = {};

    // Try to extract sections from markdown-like format
    const sections = rawResponse.split(/(?:^|\n)###\s+/g).filter(Boolean);

    sections.forEach((section) => {
      const lines = section.split('\n');
      const title = lines[0].trim();

      // Start a new recommendation
      currentRecommendation = { description: title };

      lines.slice(1).forEach((line) => {
        // Extract key-value pairs from lines like "**Priority:** High"
        const match = line.match(/\*\*(.*?):\*\*\s+(.*)/);
        if (match) {
          const [_, key, value] = match;
          const normalizedKey = key.toLowerCase().trim();

          if (normalizedKey.includes('priority')) {
            currentRecommendation.priority = value.trim();
          } else if (
            normalizedKey.includes('problem') ||
            normalizedKey.includes('issue')
          ) {
            currentRecommendation.description = value.trim();
          } else if (
            normalizedKey.includes('solution') ||
            normalizedKey.includes('recommendation')
          ) {
            currentRecommendation.solution = value.trim();
          } else if (
            normalizedKey.includes('rationale') ||
            normalizedKey.includes('reason')
          ) {
            currentRecommendation.rationale = value.trim();
          } else if (
            normalizedKey.includes('implementation') ||
            normalizedKey.includes('code')
          ) {
            currentRecommendation.implementation = value.trim();
          } else if (
            normalizedKey.includes('effect') ||
            normalizedKey.includes('impact')
          ) {
            currentRecommendation.expectedEffect = value.trim();
          } else if (normalizedKey.includes('category')) {
            currentRecommendation.category = value.trim();
          }
        } else if (line.includes('```')) {
          // Extract code blocks
          const codeBlockMatch = section.match(
            /```(?:html|css|javascript)?([\s\S]*?)```/,
          );
          if (codeBlockMatch && codeBlockMatch[1]) {
            currentRecommendation.implementation = codeBlockMatch[1].trim();
          }
        }
      });

      // Add default category if missing
      if (!currentRecommendation.category) {
        if (title.toLowerCase().includes('seo')) {
          currentRecommendation.category = 'seo';
        } else if (title.toLowerCase().includes('performance')) {
          currentRecommendation.category = 'performance';
        } else if (title.toLowerCase().includes('accessibility')) {
          currentRecommendation.category = 'accessibility';
        } else {
          currentRecommendation.category = 'general';
        }
      }

      recommendations.push(currentRecommendation);
    });

    return { recommendations };
  }
}
