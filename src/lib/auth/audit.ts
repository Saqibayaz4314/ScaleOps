import "server-only";
import { query } from "@/lib/db/pool";

/** Audit events never carry secrets. Failures to log must not break the request. */
export async function audit(userId: string | null, event: string, ip: string | null, meta: Record<string, unknown> = {}) {
  try {
    await query("INSERT INTO audit_log (user_id, event, ip, meta) VALUES ($1, $2, $3, $4)", [
      userId,
      event,
      ip,
      JSON.stringify(meta),
    ]);
  } catch {
    /* swallow */
  }
}
