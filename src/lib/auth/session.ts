import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { query } from "@/lib/db/pool";

export const SESSION_COOKIE = "scaleops_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionUser {
  id: string;
  email: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export const cookieOptions = (maxAge = SESSION_TTL_SECONDS) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

/** Creates a DB session and returns the raw token (only its hash is stored). */
export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4)`,
    [userId, sha256(token), SESSION_TTL_SECONDS, userAgent?.slice(0, 300) ?? null],
  );
  return token;
}

export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const { rows } = await query<SessionUser>(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

export async function destroyToken(token: string | undefined): Promise<void> {
  if (!token) return;
  await query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
}

/** The signed-in user for this request, or null. Fails closed on any DB/config error. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    return await userForToken(jar.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}
