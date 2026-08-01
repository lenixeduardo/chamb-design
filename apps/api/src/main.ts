import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api');

  // Without this, `onModuleDestroy` never runs on SIGTERM: the pg pool is not
  // drained and Redis never sees a QUIT. The lifecycle hooks were written; they
  // were simply never wired up.
  app.enableShutdownHooks();

  // Constraint violations are the caller's mistake far more often than the
  // server's, and they were all arriving as anonymous 500s.
  app.useGlobalFilters(new PrismaExceptionFilter());

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
