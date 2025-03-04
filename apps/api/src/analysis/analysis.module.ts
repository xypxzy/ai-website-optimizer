import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PromptGeneratorModule } from 'src/promt-generator/prompt-generator.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { ContentAnalyzer } from './analyzers/content-analyzer';
import { LinkAnalyzer } from './analyzers/link-analyzer';
import { MobileAnalyzer } from './analyzers/mobile-analyzer';
import { PerformanceAnalyzer } from './analyzers/performance-analyzer';
import { SecurityAnalyzer } from './analyzers/security-analyzer';
import { SeoAnalyzer } from './analyzers/seo-analyzer';
import { StructureAnalyzer } from './analyzers/structure-analyzer';

@Module({
  imports: [PrismaModule, PromptGeneratorModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    SeoAnalyzer,
    PerformanceAnalyzer,
    StructureAnalyzer,
    LinkAnalyzer,
    MobileAnalyzer,
    ContentAnalyzer,
    SecurityAnalyzer,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
