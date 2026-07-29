import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma lifecycle wrapper.
 *
 * Connecting is deliberately non-fatal: the API is an *optional* companion to a
 * local-first editor, and a developer running it without a database should get
 * a clear log line and a server that still answers health checks, not a crash
 * loop they have to debug before seeing anything work.
 *
 * Prisma 7 takes its connection through a driver adapter rather than from the
 * schema, which is also what lets the same client run on serverless runtimes
 * without the query engine binary.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      // `$connect()` is lazy with a driver adapter — it resolves even when the
      // database is unreachable, so it cannot be used as a readiness probe.
      // A trivial query is the only honest check.
      await this.$queryRaw`SELECT 1`;
      this.connected = true;
      this.logger.log('connected to the database');
    } catch (error) {
      this.logger.error(
        `database unavailable — persistence endpoints will return 503: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) await this.$disconnect();
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
