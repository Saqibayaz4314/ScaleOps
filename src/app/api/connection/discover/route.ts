import { apiError, assertSameOrigin, authenticate, internalError, json, readJson } from "@/lib/api/guard";
import { rateLimit } from "@/lib/auth/rate-limit";
import { discoverGroups, getIdentity, isRootArn } from "@/lib/aws/connect";
import { discoverSchema } from "@/lib/aws/validation";
import { classify, identityFailure } from "@/lib/errors/aws-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Read-only lookup of the account's Auto Scaling groups. Nothing is stored. */
export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  try {
    const a = await authenticate();
    if (!a.ok) return a.res;
    if (!(await rateLimit(`connect:user:${a.user.id}`, 20, 600))) {
      return apiError(429, "RATE_LIMITED", "Too many attempts. Try again in a few minutes.");
    }
    const parsed = discoverSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    const { region, ...creds } = parsed.data;

    let identity;
    try {
      identity = await getIdentity(region, creds);
    } catch (e) {
      const failure = identityFailure(e);
      return apiError(failure.status, failure.code, failure.message);
    }
    if (isRootArn(identity.arn)) {
      return apiError(400, "FORBIDDEN", "Root account credentials are not accepted. Create a dedicated read-only IAM user.");
    }
    try {
      const groups = await discoverGroups(region, creds);
      return json({ identity, groups });
    } catch (e) {
      const code = classify(e);
      return apiError(
        code === "AWS_ACCESS_DENIED" ? 403 : 502,
        code,
        code === "AWS_ACCESS_DENIED"
          ? "These credentials are valid but cannot list Auto Scaling groups. Attach the read-only policy shown on this page."
          : "Could not list Auto Scaling groups from AWS.",
      );
    }
  } catch {
    return internalError();
  }
}
