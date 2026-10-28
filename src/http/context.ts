import type { AppConfig } from '../config/env.ts';
import type { Db } from '../db/index.ts';
import type { RateCard } from '../domain/rateCard.ts';
import type { Logger } from '../lib/logger.ts';
import { RateLimiter } from '../lib/rateLimit.ts';

export interface Limiters {
  trackLookup: RateLimiter;
  trackFailures: RateLimiter;
  estimate: RateLimiter;
  publicForms: RateLimiter;
  login: RateLimiter;
}

export interface AppContext {
  config: AppConfig;
  db: Db;
  logger: Logger;
  rateCard: RateCard;
  limiters: Limiters;
}

export function createLimiters(): Limiters {
  return {
    trackLookup: new RateLimiter(60_000, 30),
    trackFailures: new RateLimiter(60 * 60_000, 40),
    estimate: new RateLimiter(60_000, 60),
    publicForms: new RateLimiter(60 * 60_000, 10),
    login: new RateLimiter(15 * 60_000, 10),
  };
}
