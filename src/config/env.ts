import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  SITE_URL: z.url().default('http://localhost:3000'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: optionalString,
  DATABASE_SSL: z.enum(['require', 'disable']).default('require'),
  ALLOW_EMBEDDED_DB: z.enum(['true', 'false']).default('false'),
  EMBEDDED_DB_DIR: z.string().default('.data/pglite'),

  TRACKING_CODE_SECRET: optionalString,
  TRACKING_CODE_TTL_DAYS: z.coerce.number().int().min(0).max(3650).default(0),

  PRICING_MODE: z.enum(['demo', 'rate_card', 'disabled']).optional(),
  RATE_CARD_PATH: optionalString,

  COMPANY_LEGAL_NAME: optionalString,
  COMPANY_EMAIL: optionalString,
  COMPANY_PHONE: optionalString,
  COMPANY_ADDRESS: optionalString,

  MAPBOX_PUBLIC_TOKEN: optionalString,
  EMAIL_PROVIDER: optionalString,
  PAYMENT_PROVIDER: optionalString,
});

export type RawEnv = z.infer<typeof EnvSchema>;

export interface AppConfig {
  env: RawEnv['NODE_ENV'];
  isProduction: boolean;
  port: number;
  host: string;
  siteUrl: string;
  siteOrigin: string;
  secureCookies: boolean;
  trustProxy: number;
  logLevel: RawEnv['LOG_LEVEL'];
  database:
    | { kind: 'postgres'; url: string; ssl: boolean }
    | { kind: 'embedded'; dir: string | null };
  trackingCodeSecret: string;
  trackingCodeTtlDays: number;
  pricingMode: 'demo' | 'rate_card' | 'disabled';
  rateCardPath: string | undefined;
  company: {
    legalName: string | undefined;
    email: string | undefined;
    phone: string | undefined;
    address: string | undefined;
  };
  integrations: {
    mapboxPublicToken: string | undefined;
    emailProvider: string | undefined;
    paymentProvider: string | undefined;
  };
  warnings: string[];
}

const DEV_TRACKING_SECRET = 'development-only-tracking-secret-do-not-use-in-production';

export class ConfigError extends Error {}

/**
 * Validates environment variables once at startup. Production refuses to start
 * with missing secrets instead of silently falling back to insecure defaults.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env, overrides: Partial<AppConfig> = {}): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const warnings: string[] = [];
  const errors: string[] = [];

  let trackingCodeSecret = e.TRACKING_CODE_SECRET;
  if (!trackingCodeSecret) {
    if (isProduction) errors.push('TRACKING_CODE_SECRET is required in production (32+ random characters).');
    trackingCodeSecret = DEV_TRACKING_SECRET;
    if (e.NODE_ENV === 'development') warnings.push('TRACKING_CODE_SECRET not set; using an insecure development value.');
  } else if (trackingCodeSecret.length < 32) {
    errors.push('TRACKING_CODE_SECRET must be at least 32 characters.');
  }

  let database: AppConfig['database'];
  if (e.DATABASE_URL) {
    database = { kind: 'postgres', url: e.DATABASE_URL, ssl: e.DATABASE_SSL === 'require' };
  } else {
    if (isProduction && e.ALLOW_EMBEDDED_DB !== 'true') {
      errors.push('DATABASE_URL is required in production. Set ALLOW_EMBEDDED_DB=true only for a single-instance demo.');
    }
    database = { kind: 'embedded', dir: e.NODE_ENV === 'test' ? null : e.EMBEDDED_DB_DIR };
    if (e.NODE_ENV !== 'test') warnings.push(`Using embedded PGlite database at ${e.EMBEDDED_DB_DIR}.`);
  }

  const pricingMode = e.PRICING_MODE ?? (isProduction ? 'disabled' : 'demo');
  if (pricingMode === 'rate_card' && !e.RATE_CARD_PATH) {
    errors.push('PRICING_MODE=rate_card requires RATE_CARD_PATH pointing to an owner-approved rate card JSON file.');
  }
  if (isProduction && pricingMode === 'demo') {
    warnings.push('PRICING_MODE=demo in production: all prices are labelled as demonstration estimates.');
  }

  const renderUrl = typeof source.RENDER_EXTERNAL_URL === 'string' ? source.RENDER_EXTERNAL_URL.trim().replace(/\/$/, '') : '';
  const siteUrl = (e.SITE_URL === 'http://localhost:3000' && renderUrl ? renderUrl : e.SITE_URL).replace(/\/$/, '');
  const siteOrigin = new URL(siteUrl).origin;
  if (isProduction && !siteUrl.startsWith('https://')) {
    errors.push('SITE_URL must use https:// in production. On Render, set SITE_URL or rely on RENDER_EXTERNAL_URL.');
  }

  if (errors.length > 0) throw new ConfigError(errors.join(' '));

  return {
    env: e.NODE_ENV,
    isProduction,
    port: e.PORT,
    host: e.HOST,
    siteUrl,
    siteOrigin,
    secureCookies: siteUrl.startsWith('https://'),
    trustProxy: e.TRUST_PROXY,
    logLevel: e.LOG_LEVEL,
    database,
    trackingCodeSecret,
    trackingCodeTtlDays: e.TRACKING_CODE_TTL_DAYS,
    pricingMode,
    rateCardPath: e.RATE_CARD_PATH,
    company: {
      legalName: e.COMPANY_LEGAL_NAME,
      email: e.COMPANY_EMAIL,
      phone: e.COMPANY_PHONE,
      address: e.COMPANY_ADDRESS,
    },
    integrations: {
      mapboxPublicToken: e.MAPBOX_PUBLIC_TOKEN,
      emailProvider: e.EMAIL_PROVIDER,
      paymentProvider: e.PAYMENT_PROVIDER,
    },
    warnings,
    ...overrides,
  };
}
