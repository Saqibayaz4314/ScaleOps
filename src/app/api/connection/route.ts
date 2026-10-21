import { apiError, assertSameOrigin, authenticate, clientIp, internalError, json, readJson } from "@/lib/api/guard";
import { audit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getIdentity, isRootArn, runChecks } from "@/lib/aws/connect";
import { connectSchema } from "@/lib/aws/validation";
import type { AwsContext } from "@/lib/aws/context";
import { deleteConnection, getConnectionMeta, saveConnection } from "@/lib/db/connections";
import { identityFailure, messageFor } from "@/lib/errors/aws-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const a = await authenticate();
    if (!a.ok) return a.res;
    const meta = await getConnectionMeta(a.user.id);
    return json({ connected: meta !== null, connection: meta, user: { email: a.user.email } });
  } catch {
    return internalError();
  }
}

/** Verify-then-save. Credentials are checked against AWS first and stored only as an encrypted blob. */
export async function PUT(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  try {
    const a = await authenticate();
    if (!a.ok) return a.res;
    if (!(await rateLimit(`connect:user:${a.user.id}`, 20, 600))) {
      return apiError(429, "RATE_LIMITED", "Too many attempts. Try again in a few minutes.");
    }
    const parsed = connectSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    const { accessKeyId, secretAccessKey, ...target } = parsed.data;
    const credentials = { accessKeyId, secretAccessKey };

    let identity;
    try {
      identity = await getIdentity(target.region, credentials);
    } catch (e) {
      const failure = identityFailure(e);
      return apiError(failure.status, failure.code, failure.message);
    }
    if (isRootArn(identity.arn)) {
      return apiError(400, "FORBIDDEN", "Root account credentials are not accepted. Create a dedicated read-only IAM user.");
    }

    const ctx: AwsContext = { connectionId: "pending", version: 0, credentials, ...target, albArn: target.albArn, targetGroupArn: target.targetGroupArn };
    const checks = await runChecks(ctx);
    // The ASG itself must be reachable; other gaps are reported but do not block saving.
    if (!checks[0]?.ok) {
      const code = checks[0]?.error?.code ?? "AWS_UNAVAILABLE";
      return json({ status: "error", code, message: messageFor(code), checks }, 422);
    }
    await saveConnection(a.user.id, target, credentials, identity);
    await audit(a.user.id, "connection_saved", clientIp(req), { region: target.region, account: identity.accountId });
    return json({ ok: true, identity: { accountId: identity.accountId, arn: identity.arn }, checks });
  } catch {
    return internalError();
  }
}

export async function DELETE(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  try {
    const a = await authenticate();
    if (!a.ok) return a.res;
    const removed = await deleteConnection(a.user.id);
    if (removed) await audit(a.user.id, "connection_deleted", clientIp(req));
    return json({ ok: true, removed });
  } catch {
    return internalError();
  }
}
