import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../config/env.ts';
import type { Db } from '../db/index.ts';
import type { RateCard } from '../domain/rateCard.ts';
import { AppError } from '../lib/errors.ts';
import { redactUrl, type Logger } from '../lib/logger.ts';
import { publicLayout } from '../views/layout.ts';
import { errorPage } from '../views/public/pages.ts';
import { adminRouter } from './admin.ts';
import { createLimiters, type AppContext } from './context.ts';
import { publicRouter } from './public.ts';
import { sameOriginWrites, securityHeaders } from './security.ts';

const PUBLIC_DIR = fileURLToPath(new URL('../../public', import.meta.url));

export function createApp(opts: { config: AppConfig; db: Db; logger: Logger; rateCard: RateCard }) {
  const ctx: AppContext = { ...opts, limiters: createLimiters() };
  const { config, db, logger } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');

  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const isAsset = /^\/(css|js|fonts|images)\//.test(req.path) || req.path === '/favicon.svg';
      const entry = { method: req.method, url: redactUrl(req.originalUrl), status: res.statusCode, ms: Math.round(ms) };
      if (res.statusCode >= 500) logger.error('http.request', entry);
      else if (isAsset) logger.debug('http.request', entry);
      else logger.info('http.request', entry);
    });
    next();
  });

  app.use(securityHeaders(config));
  app.use(
    express.static(PUBLIC_DIR, {
      index: false,
      dotfiles: 'deny',
      maxAge: config.isProduction ? '7d' : 0,
      setHeaders: (res, path) => {
        if (/\.(woff2|webp|jpg|png|svg|mp4)$/.test(path) && config.isProduction) res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      },
    }),
  );
  app.use(sameOriginWrites(config));
  app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 200 }));

  app.get('/healthz', async (_req, res) => {
    try {
      await db.query('select 1');
      res.setHeader('Cache-Control', 'no-store');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/admin', adminRouter(ctx));
  app.use(publicRouter(ctx));

  app.use((req, res) => {
    res.status(404).type('html').send(
      publicLayout(config, { title: 'Page not found', description: '', path: req.path, noindex: true },
        errorPage(404, 'We could not find that page', 'The page may have moved, or the address may be mistyped. If you are looking for a shipment, use the tracking page.')),
    );
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof AppError ? err.status : typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
    if (status >= 500) logger.error('http.error', { url: redactUrl(req.originalUrl), error: err instanceof Error ? err.stack : String(err) });
    if (res.headersSent) return;
    const message =
      status === 413 ? 'The form you sent was too large.' : status < 500 && err instanceof AppError ? err.publicMessage : status < 500 ? 'The request could not be processed.' : 'Something went wrong on our side. Please try again in a moment.';
    res.status(status).type('html').send(
      publicLayout(config, { title: 'Something went wrong', description: '', path: req.path, noindex: true }, errorPage(status, status >= 500 ? 'Something went wrong' : 'We could not process that request', message)),
    );
  });

  return app;
}
