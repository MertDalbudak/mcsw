import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// Load .env from the workspace root (one above /server) so we keep a
// single env file for the whole project. Falls back to a local .env if
// the root one is absent — useful in tests.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: [resolve(__dirname, '../../../.env'), resolve(__dirname, '../../.env')], quiet: true });

// Coerce common string truthy/falsy literals into a real boolean. Used
// for env vars where users might write "true" / "1" / "yes".
const Bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  });

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  PUBLIC_URL: z.string().url().default('http://localhost:3002'),

  DATABASE_URL: z.string().min(1),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(30 * 24 * 60 * 60 * 1000),
  COOKIE_SECURE: Bool.default(false),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  SIGNUP_REQUIRES_INVITE: Bool.default(true),
  EMAIL_VERIFICATION_REQUIRED: Bool.default(true),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('mcsw <noreply@example.com>'),

  MCSM_BOOTSTRAP: z.string().default(''),
  MCSM_SCAN_ENABLED: Bool.default(true),
  MCSM_SCAN_PORTS: z.string().default('8124'),
  MCSM_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isDev: parsed.data.NODE_ENV === 'development',
  isTest: parsed.data.NODE_ENV === 'test',
  scanPorts: parsed.data.MCSM_SCAN_PORTS.split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0),
};

export type AppConfig = typeof config;
