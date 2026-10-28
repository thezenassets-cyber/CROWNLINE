import { ConfigError, loadConfig } from './config/env.ts';
import { createDb } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { DEMO_RATE_CARD, loadRateCardFile } from './domain/rateCard.ts';
import { createApp } from './http/app.ts';
import { createLogger } from './lib/logger.ts';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`Configuration error: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  const logger = createLogger(config.logLevel);
  for (const w of config.warnings) logger.warn('config.warning', { message: w });

  const db = await createDb(config.database);
  await migrate(db, (msg) => logger.info('db.migration', { message: msg }));

  // Disabled mode still uses the demo card's dimensional rules to show billable weight, never its prices.
  const rateCard = config.pricingMode === 'rate_card' && config.rateCardPath ? await loadRateCardFile(config.rateCardPath) : DEMO_RATE_CARD;

  const app = createApp({ config, db, logger, rateCard });
  const server = app.listen(config.port, config.host, () => {
    logger.info('server.started', { url: config.siteUrl, port: config.port, pricingMode: config.pricingMode, database: db.kind });
  });
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;

  const shutdown = (signal: string) => {
    logger.info('server.stopping', { signal });
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal startup error: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
