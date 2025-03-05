import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('7d'),
        OPENAI_API_KEY: Joi.string().required(),
        OPENAI_MODEL: Joi.string().default('gpt-3.5-turbo'),
        GEMINI_API_KEY: Joi.string().required(),
        GEMINI_MODEL: Joi.string().default('gemini-2.0-flash'),
        MAX_TOKENS: Joi.number().default(4000),
        TEMPERATURE: Joi.number().default(0.7),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        UPLOAD_DIR: Joi.string().default('uploads'),
      }),
    }),
  ],
})
export class ConfigModule {}
