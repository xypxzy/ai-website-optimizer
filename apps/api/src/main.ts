import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { BullBoardService } from './bull/bull-board.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors();

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Настройка Bull Board
  try {
    const bullBoardService = app.get(BullBoardService, { strict: false });
    if (bullBoardService) {
      const router = bullBoardService.getRouter();
      app.use('/admin/queues', router);
      console.log('Bull Board service initialized successfully');
    }
  } catch (e) {
    console.warn('Bull Board service is not available:', e.message);
  }

  // Enable Swagger
  const options = new DocumentBuilder()
    .setTitle('AI Website Optimizer API')
    .setDescription('The API for AI Website Optimizer platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(
    `Bull Board is available at: http://localhost:${port}/admin/queues`,
  );
  console.log(
    `Swagger documentation is available at: http://localhost:${port}/api`,
  );
  console.log(`PgAdmin is available at: http://localhost:5050`);
  console.log(`RedisInsight is available at: http://localhost:8001`);
}
bootstrap();
