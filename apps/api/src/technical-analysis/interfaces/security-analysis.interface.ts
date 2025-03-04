import { IAnalysisResult } from './analysis.interface';

/**
 * Интерфейс для результатов анализа безопасности
 */
export interface ISecurityAnalysisResult extends IAnalysisResult {
  metrics: {
    usesHttps: boolean; // Использует ли сайт HTTPS
    hasMixedContent: boolean; // Наличие смешанного контента (HTTP на HTTPS странице)
    mixedContentItems?: Array<{
      url: string;
      type: 'script' | 'style' | 'image' | 'font' | 'object' | 'other';
    }>;
    sslCertificate?: {
      valid: boolean; // Действительность сертификата
      issuer?: string; // Издатель сертификата
      validFrom?: string; // Действителен с
      validTo?: string; // Действителен до
      daysRemaining?: number; // Количество дней до истечения срока
    };
    securityHeaders: {
      contentSecurityPolicy?: boolean; // Content-Security-Policy
      xContentTypeOptions?: boolean; // X-Content-Type-Options
      xFrameOptions?: boolean; // X-Frame-Options
      xXssProtection?: boolean; // X-XSS-Protection
      strictTransportSecurity?: boolean; // Strict-Transport-Security
      referrerPolicy?: boolean; // Referrer-Policy
      permissionsPolicy?: boolean; // Permissions-Policy
    };
    cookieSecurity: {
      hasCookies: boolean; // Наличие cookies
      secureCookies: number; // Количество secure cookies
      httpOnlyCookies: number; // Количество httpOnly cookies
      sameSiteCookies: number; // Количество sameSite cookies
      thirdPartyCookies: number; // Количество сторонних cookies
    };
    vulnerabilities: {
      outdatedLibraries: number; // Количество устаревших библиотек
      knownVulnerabilities: Array<{
        library: string;
        version: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        description?: string;
      }>;
    };
  };
}
