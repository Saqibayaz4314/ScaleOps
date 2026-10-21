import { z } from "zod";
import { apiError, assertSameOrigin, clientIp, internalError, json, readJson } from "@/lib/api/guard";
import { audit } from "@/lib/auth/audit";
import { dummyHash, verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, cookieOptions, createSession } from "@/lib/auth/session";
import { findUserByEmail, normalizeEmail } from "@/lib/db/users";
import { loadServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ email: z.string().trim().max(254), password: z.string().min(1).max(128) }).strict();

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  try {
    if (!loadServerEnv().ok) return apiError(503, "NOT_CONFIGURED", "The server is not configured correctly.");
    const ip = clientIp(req);
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "BAD_REQUEST", "Email and password are required.");
    const email = normalizeEmail(parsed.data.email);
    const [ipOk, emailOk] = await Promise.all([
      rateLimit(`login:ip:${ip}`, 30, 600),
      rateLimit(`login:email:${email}`, 8, 600),
    ]);
    if (!ipOk || !emailOk) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again in a few minutes.");

    const user = await findUserByEmail(email);
    // Always do one scrypt verification so response time does not reveal whether the email exists.
    const valid = await verifyPassword(parsed.data.password, user?.password_hash ?? (await dummyHash()));
    if (!user || !valid) {
      await audit(user?.id ?? null, "login_failed", ip);
      return apiError(401, "UNAUTHENTICATED", "Incorrect email or password.");
    }
    await audit(user.id, "login", ip);
    const token = await createSession(user.id, req.headers.get("user-agent"));
    const res = json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return res;
  } catch {
    return internalError();
  }
}
