import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config/env.ts';

export function securityHeaders(config: AppConfig) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https://server.arcgisonline.com",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    ...(config.isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  return (_req: Request, res: Response, next: NextFunction) => {
    const nonce = randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    const policy = csp.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`);
    res.setHeader('Content-Security-Policy', policy);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function cookieName(config: AppConfig, base: string): string {
  return config.secureCookies ? `__Host-${base}` : base;
}

export function setCookie(res: Response, config: AppConfig, name: string, value: string, maxAgeSeconds: number | null): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (config.secureCookies) parts.push('Secure');
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${maxAgeSeconds}`);
  res.append('Set-Cookie', parts.join('; '));
}

export function clearCookie(res: Response, config: AppConfig, name: string): void {
  setCookie(res, config, name, '', 0);
}

export function clientIp(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
}

/**
 * Rejects state-changing requests whose Origin (or Referer) is another site.
 * Combined with SameSite=Strict cookies and per-session CSRF tokens on the admin console.
 */
export function sameOriginWrites(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const origin = req.get('origin');
    let source = origin && origin !== 'null' ? origin : undefined;
    if (!source) {
      const ref = req.get('referer');
      if (ref) {
        try {
          source = new URL(ref).origin;
        } catch {
          source = 'invalid';
        }
      }
    }
    const host = req.get('host');
    const requestOrigin = host ? `${req.protocol}://${host}` : '';
    const allowed = config.isProduction ? config.siteOrigins : [...config.siteOrigins, requestOrigin];
    if (origin === 'null' || (source && !allowed.includes(source))) {
      res.status(403).type('text/plain').send('Cross-site form submissions are not allowed.');
      return;
    }
    next();
  };
}

/** Accepts only same-site relative admin paths, preventing open redirects. */
export function safeAdminRedirect(target: unknown): string {
  if (typeof target !== 'string') return '/admin';
  if (!/^\/admin(\/[A-Za-z0-9\-_/?=&%.]*)?$/.test(target) || target.startsWith('//') || target.includes('\\')) return '/admin';
  return target;
}
