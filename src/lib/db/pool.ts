import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { requireServerEnv } from "@/lib/env";
import { buildPoolConfig } from "./config";

// Serverless-friendly: small pool per instance. Use a pooled connection string
// (e.g. Neon/Supabase pooler) in production so many instances do not exhaust connections.
// Reuse the dev pool across hot reloads instead of leaving extra DB connections open.
const globalDb = globalThis as typeof globalThis & { scaleOpsPool?: Pool };
let pool: Pool | undefined = globalDb.scaleOpsPool;

export function getPool(): Pool {
  if (!pool) {
    const env = requireServerEnv();
    pool = new Pool({
      ...buildPoolConfig(env.DATABASE_URL, env.DATABASE_SSL),
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
      statement_timeout: 8_000,
    });
    pool.on("error", () => undefined); // idle-client errors must not crash the process
    if (process.env.NODE_ENV !== "production") globalDb.scaleOpsPool = pool;
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
