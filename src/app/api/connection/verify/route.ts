import { apiError, assertSameOrigin, authenticateWithAws, internalError, json } from "@/lib/api/guard";
import { rateLimit } from "@/lib/auth/rate-limit";
import { runChecks } from "@/lib/aws/connect";
import { recordVerification } from "@/lib/db/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  try {
    const a = await authenticateWithAws();
    if (!a.ok) return a.res;
    if (!(await rateLimit(`verify:user:${a.user.id}`, 20, 600))) {
      return apiError(429, "RATE_LIMITED", "Too many attempts. Try again in a few minutes.");
    }
    const checks = await runChecks(a.ctx);
    const failed = checks.filter((c) => !c.ok);
    await recordVerification(a.user.id, failed.length ? `${failed.length} check(s) failed` : null);
    return json({ ok: failed.length === 0, checks });
  } catch {
    return internalError();
  }
}
