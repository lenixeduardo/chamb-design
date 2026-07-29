import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 no longer reads the connection URL from `schema.prisma`. Migrations
 * take it from here; the runtime client takes it from the driver adapter, so
 * the URL is declared exactly once per context instead of duplicated.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
