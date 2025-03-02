import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { PageScansModule } from './page-scans/page-scans.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    ProjectsModule,
    PageScansModule,
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
