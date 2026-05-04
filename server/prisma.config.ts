import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Load the workspace-root .env so we keep a single env file.
loadEnv({ path: [resolve(__dirname, '../.env'), resolve(__dirname, '.env')], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/scripts/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
