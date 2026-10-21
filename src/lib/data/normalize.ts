// Pure transformation helpers. No SDK imports so they are trivially unit-testable.
import type {
  ActivityStatus,
  AlbTargetState,
  CapacitySnapshot,
  MetricSeries,
  ScalingEvent,
  TargetSnapshot,
  TargetSummary,
  TimePoint,
} from "@/types/api";

/** `arn:...:loadbalancer/app/name/id` -> `app/name/id` (the CloudWatch `LoadBalancer` dimension). */
export function deriveAlbDimension(albArn: string): string {
  const m = /:loadbalancer\/(app\/[^/]+\/[^/]+)$/.exec(albArn);
  if (!m?.[1]) throw new Error("Invalid ALB ARN: expected ...:loadbalancer/app/<name>/<id>");
  return m[1];
}

/** `arn:...:targetgroup/name/id` -> `targetgroup/name/id` (the `TargetGroup` dimension). */
export function deriveTargetGroupDimension(tgArn: string): string {
  const m = /:(targetgroup\/[^/]+\/[^/]+)$/.exec(tgArn);
  if (!m?.[1]) throw new Error("Invalid target group ARN");
  return m[1];
}

export function albNameFromArn(albArn: string): string | null {
  return /:loadbalancer\/app\/([^/]+)\//.exec(albArn)?.[1] ?? null;
}

export function targetGroupNameFromArn(tgArn: string): string | null {
  return /:targetgroup\/([^/]+)\//.exec(tgArn)?.[1] ?? null;
}

export interface RangeSpec {
  durationMs: number;
  /** Period used for ALB metrics. */
  albPeriod: 60 | 300;
  /** EC2 basic monitoring publishes every 5 minutes, so CPU always uses 300s. */
  cpuPeriod: 300;
}

export const RANGES: Record<"1h" | "3h" | "6h", RangeSpec> = {
  "1h": { durationMs: 3_600_000, albPeriod: 60, cpuPeriod: 300 },
  "3h": { durationMs: 3 * 3_600_000, albPeriod: 60, cpuPeriod: 300 },
  "6h": { durationMs: 6 * 3_600_000, albPeriod: 300, cpuPeriod: 300 },
};

/**
 * Zip CloudWatch timestamps/values, sort ascending and lay them on the period grid.
 * Grid slots without a datapoint become `null` (a gap) — never zero.
 */
export function buildPoints(
  timestamps: Date[] | undefined,
  values: number[] | undefined,
  startMs: number,
  endMs: number,
  periodSeconds: number,
): TimePoint[] {
  const stepMs = periodSeconds * 1000;
  const byBucket = new Map<number, number>();
  const ts = timestamps ?? [];
  const vs = values ?? [];
  for (let i = 0; i < Math.min(ts.length, vs.length); i++) {
    const t = ts[i];
    const v = vs[i];
    if (t === undefined || v === undefined || !Number.isFinite(v)) continue;
    byBucket.set(Math.floor(t.getTime() / stepMs) * stepMs, v);
  }
  const first = Math.ceil(startMs / stepMs) * stepMs;
  const points: TimePoint[] = [];
  for (let t = first; t <= endMs; t += stepMs) {
    points.push({ timestamp: new Date(t).toISOString(), value: byBucket.get(t) ?? null });
  }
  return points;
}

export function latestObserved(points: TimePoint[]): string | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p && p.value !== null) return p.timestamp;
  }
  return null;
}

export function hasData(points: TimePoint[]): boolean {
  return points.some((p) => p.value !== null);
}

/** Mean across reporting instances per timestamp (fallback CPU aggregate). */
export function meanAcrossSeries(
  series: { timestamps?: Date[]; values?: number[] }[],
  periodSeconds: number,
): { timestamps: Date[]; values: number[] } {
  const stepMs = periodSeconds * 1000;
  const acc = new Map<number, { sum: number; n: number }>();
  for (const s of series) {
    const ts = s.timestamps ?? [];
    const vs = s.values ?? [];
    for (let i = 0; i < Math.min(ts.length, vs.length); i++) {
      const t = ts[i];
      const v = vs[i];
      if (t === undefined || v === undefined || !Number.isFinite(v)) continue;
      const k = Math.floor(t.getTime() / stepMs) * stepMs;
      const e = acc.get(k) ?? { sum: 0, n: 0 };
      e.sum += v;
      e.n += 1;
      acc.set(k, e);
    }
  }
  const keys = [...acc.keys()].sort((a, b) => a - b);
  return {
    timestamps: keys.map((k) => new Date(k)),
    values: keys.map((k) => {
      const e = acc.get(k)!;
      return e.sum / e.n;
    }),
  };
}

export function toMillis(seconds: number | null): number | null {
  return seconds === null ? null : seconds * 1000;
}

export function makeSeries(
  base: Omit<MetricSeries, "points" | "latestObservedAt">,
  points: TimePoint[],
): MetricSeries {
  return { ...base, points, latestObservedAt: latestObserved(points) };
}

// ---- Auto Scaling ----------------------------------------------------------------

export function capacityFromGroup(group: {
  MinSize?: number;
  MaxSize?: number;
  DesiredCapacity?: number;
  Instances?: { LifecycleState?: string }[];
}): CapacitySnapshot {
  const instances = group.Instances ?? [];
  const count = (pred: (s: string) => boolean) =>
    instances.filter((i) => pred(i.LifecycleState ?? "")).length;
  return {
    min: group.MinSize ?? 0,
    max: group.MaxSize ?? 0,
    desired: group.DesiredCapacity ?? 0,
    inService: count((s) => s === "InService"),
    pending: count((s) => s.startsWith("Pending")),
    terminating: count((s) => s.startsWith("Terminating")),
  };
}

export function mapActivityStatus(statusCode: string | undefined): ActivityStatus {
  switch (statusCode) {
    case "Successful":
      return "Successful";
    case "Failed":
      return "Failed";
    case "Cancelled":
      return "Cancelled";
    case undefined:
    case "":
      return "Other";
    default:
      // Pending*/Waiting*/PreInService/InProgress/MidLifecycleAction/... are all non-terminal.
      return "InProgress";
  }
}

/** Capacity change only when AWS' own text states it ("from 1 to 2"). */
export function parseCapacityChange(text: string): { from: number; to: number } | null {
  const m = /capacity from (\d+) to (\d+)/i.exec(text);
  if (!m?.[1] || !m[2]) return null;
  return { from: Number(m[1]), to: Number(m[2]) };
}

const MAX_TEXT = 600;
const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

export function mapActivity(a: {
  ActivityId?: string;
  StartTime?: Date;
  EndTime?: Date;
  StatusCode?: string;
  Description?: string;
  Cause?: string;
  Progress?: number;
}): ScalingEvent {
  const description = a.Description ?? "";
  const cause = a.Cause ?? "";
  return {
    activityId: a.ActivityId ?? "unknown",
    startedAt: a.StartTime ? a.StartTime.toISOString() : null,
    endedAt: a.EndTime ? a.EndTime.toISOString() : null,
    statusCode: a.StatusCode ?? "Unknown",
    status: mapActivityStatus(a.StatusCode),
    description: clip(description),
    cause: clip(cause),
    progress: typeof a.Progress === "number" ? a.Progress : null,
    capacityChange: parseCapacityChange(`${cause} ${description}`),
  };
}

export function sortEventsDesc(events: ScalingEvent[]): ScalingEvent[] {
  return [...events].sort(
    (a, b) => (Date.parse(b.startedAt ?? "") || 0) - (Date.parse(a.startedAt ?? "") || 0),
  );
}

// ---- ELBv2 -----------------------------------------------------------------------

const TARGET_STATES: AlbTargetState[] = [
  "healthy",
  "unhealthy",
  "initial",
  "draining",
  "unused",
  "unavailable",
];

export function mapTargetState(state: string | undefined): AlbTargetState {
  const s = (state ?? "").toLowerCase();
  return (TARGET_STATES as string[]).includes(s) ? (s as AlbTargetState) : "unknown";
}

export function summarizeTargets(
  descriptions: {
    Target?: { Id?: string };
    TargetHealth?: { State?: string; Reason?: string; Description?: string };
  }[],
): TargetSummary {
  const summary: TargetSummary = {
    healthy: 0,
    unhealthy: 0,
    initial: 0,
    draining: 0,
    unused: 0,
    unavailable: 0,
    targets: [],
  };
  for (const d of descriptions) {
    const state = mapTargetState(d.TargetHealth?.State);
    if (state !== "unknown") summary[state] += 1;
    const t: TargetSnapshot = {
      targetId: d.Target?.Id ?? "unknown",
      state,
      reason: d.TargetHealth?.Reason ?? null,
      description: d.TargetHealth?.Description ?? null,
    };
    summary.targets.push(t);
  }
  return summary;
}
