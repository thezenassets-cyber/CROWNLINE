import { mkdirSync } from 'node:fs';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import type { AppConfig } from '../config/env.ts';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** Anything that can run a parameterised query: the pool or an open transaction. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
}

export interface Db extends Queryable {
  readonly kind: 'postgres' | 'embedded';
  /** Runs `fn` inside BEGIN/COMMIT; any thrown error rolls the transaction back. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  /** Executes a multi-statement SQL script (migrations only). */
  execScript(sql: string): Promise<void>;
  close(): Promise<void>;
}

class PostgresDb implements Db {
  readonly kind = 'postgres' as const;
  private pool: pg.Pool;

  constructor(url: string, ssl: boolean) {
    this.pool = new pg.Pool({
      connectionString: url,
      ssl: ssl ? { rejectUnauthorized: true } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 15_000,
    });
  }

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const res = await this.pool.query(sql, params as unknown[]);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx: Queryable = {
        async query<R>(sql: string, params: readonly unknown[] = []) {
          const res = await client.query(sql, params as unknown[]);
          return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
        },
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async execScript(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class EmbeddedDb implements Db {
  readonly kind = 'embedded' as const;
  private pg: PGlite;

  constructor(dir: string | null) {
    if (dir) mkdirSync(dir, { recursive: true });
    this.pg = dir ? new PGlite(dir) : new PGlite();
  }

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const res = await this.pg.query<T>(sql, params as unknown[]);
    return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (t) => {
      const tx: Queryable = {
        async query<R>(sql: string, params: readonly unknown[] = []) {
          const res = await t.query<R>(sql, params as unknown[]);
          return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
        },
      };
      return fn(tx);
    });
  }

  async execScript(sql: string): Promise<void> {
    await this.pg.exec(sql);
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}

export function createDb(config: AppConfig['database']): Db {
  return config.kind === 'postgres' ? new PostgresDb(config.url, config.ssl) : new EmbeddedDb(config.dir);
}

/** Postgres error code for unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
