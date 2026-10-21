import { cookies } from "next/headers";
import { assertSameOrigin, internalError, json } from "@/lib/api/guard";
import { SESSION_COOKIE, cookieOptions, destroyToken } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  try {
    const jar = await cookies();
    await destroyToken(jar.get(SESSION_COOKIE)?.value);
    const res = json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
    return res;
  } catch {
    return internalError();
  }
}
