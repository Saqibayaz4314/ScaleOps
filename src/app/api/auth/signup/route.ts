import { z } from "zod";
import { apiError, assertSameOrigin, clientIp, internalError, json, readJson } from "@/lib/api/guard";
import { audit } from "@/lib/auth/audit";
import { hashPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, cookieOptions, createSession } from "@/lib/auth/session";
import { createUser } from "@/lib/db/users";
import { loadServerEnv } from "@/lib/env";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
    email: z.string().trim().max(254).email(),
    password: z.string().min(10, "Password must be at least 10 characters").max(128),
    inviteCode: z.string().max(200).optional(),
  })
  .strict();

function codesMatch(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  try {
    const env = loadServerEnv();
    if (!env.ok) return apiError(503, "NOT_CONFIGURED", "The server is not configured correctly.");
    if (!env.env.SIGNUP_ENABLED) return apiError(403, "FORBIDDEN", "Sign-up is disabled on this deployment.");
    const ip = clientIp(req);
    if (!(await rateLimit(`signup:ip:${ip}`, 10, 3600))) {
      return apiError(429, "RATE_LIMITED", "Too many sign-up attempts. Try again later.");
    }
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) {
      return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    }
    const invite = env.env.SIGNUP_INVITE_CODE;
    if (invite && !(parsed.data.inviteCode && codesMatch(parsed.data.inviteCode, invite))) {
      return apiError(403, "FORBIDDEN", "A valid invite code is required.");
    }
    if (parsed.data.password.toLowerCase() === parsed.data.email.toLowerCase()) {
      return apiError(400, "BAD_REQUEST", "Password must not be your email address.");
    }
    const user = await createUser(parsed.data.email, await hashPassword(parsed.data.password), parsed.data.name);
    if (!user) {
      return apiError(409, "BAD_REQUEST", "An account with this email may already exist. Try signing in.");
    }
    await audit(user.id, "signup", ip);
    const token = await createSession(user.id, req.headers.get("user-agent"));
    const res = json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return res;
  } catch (error) {
    // Log only safe diagnostic categories, never database URLs, inputs or SDK messages.
    const failure = error as { code?: string; name?: string; message?: string };
    console.error("Signup failed", {
      code: /^[A-Z0-9_]{1,40}$/.test(failure.code ?? "") ? failure.code : "UNKNOWN",
      timeout: /timeout|timed out/i.test(failure.message ?? ""),
    });
    if (/timeout|timed out/i.test(failure.message ?? "") || /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EACCES|ENOTFOUND|53300|57P03)$/.test(failure.code ?? "")) {
      return apiError(503, "SERVER_ERROR", "The database connection is temporarily unavailable. Please try again shortly.");
    }
    return internalError();
  }
}
