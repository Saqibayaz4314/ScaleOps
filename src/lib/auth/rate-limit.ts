import "server-only";
import { query } from "@/lib/db/pool";

/**
 * Fixed-window counter in Postgres (shared by all serverless instances).
 * Returns true while the caller is still within `limit` hits per `windowSeconds`.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { rows } = await query<{ count: number }>(
    `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING count`,
    [key, windowSeconds],
  );
  return (rows[0]?.count ?? 1) <= limit;
}

/** Housekeeping, called opportunistically. */
export async function pruneRateLimits(): Promise<void> {
  await query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'");
}
