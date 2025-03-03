import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BullBoardModule } from './bull/bull-board.module';
import { BullModule } from './bull/bull.module';
import { ConfigModule } from './config/config.module';
import { CrawlerModule } from './crawler/crawler.module';
import { PageScansModule } from './page-scans/page-scans.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TechnicalAnalysisModule } from './technical-analysis/technical-analysis.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    BullModule,
    BullBoardModule,
    AuthModule,
    ProjectsModule,
    PageScansModule,
    CrawlerModule,
    TechnicalAnalysisModule,
    // В финальной версии здесь будут подключены другие модули:
    // AnalysisModule,
    // PromptsModule,
    // RecommendationsModule,
    // и другие
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
