import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api');

  // No class-validator DTO layer on purpose. The payloads that matter here are
  // design documents and operations, and those are validated by the core zod
  // schemas — the same ones the editor and the AI layer use. A second,
  // decorator-based validation layer would only be able to disagree with it.

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  // Documents are large; the default 100kb body limit rejects real projects.
  app.useBodyParser('json', { limit: '32mb' });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);

  new Logger('bootstrap').log(`OpenDesign API listening on http://localhost:${port}/api`);
}

void bootstrap();
