// Alias for the path used in docs/02-TRD; same handler as /api/scaling-events.
import { GET as scalingEventsGet } from "../scaling-events/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = scalingEventsGet;
