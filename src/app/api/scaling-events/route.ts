import { authenticateWithAws, badRequest, internalError, json, parseLimit } from "@/lib/api/guard";
import { getEvents } from "@/lib/aws/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const a = await authenticateWithAws();
    if (!a.ok) return a.res;
    const limit = parseLimit(new URL(req.url).searchParams.get("limit"));
    if (limit === null) return badRequest("limit must be an integer between 1 and 50");
    const { httpStatus, body } = await getEvents(a.ctx, limit);
    return json(body, httpStatus);
  } catch {
    return internalError();
  }
}
