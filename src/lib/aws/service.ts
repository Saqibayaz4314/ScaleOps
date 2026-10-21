import "server-only";
import {
  albNameFromArn,
  capacityFromGroup,
  targetGroupNameFromArn,
} from "@/lib/data/normalize";
import { normalizeAwsError, classify } from "@/lib/errors/aws-errors";
import type {
  EventsResponse,
  InfrastructureResponse,
  InstanceRow,
  MetricsResponse,
  OverviewResponse,
  PanelError,
  PanelSource,
  RangeKey,
  ResourceContext,
  ServiceStatus,
} from "@/types/api";
import { describeGroup, getScalingEvents } from "./asg";
import { cached } from "./cache";
import type { AwsContext } from "./context";
import { getEc2Details } from "./ec2";
import { getTargetHealth } from "./elbv2";
import { getMetrics } from "./cloudwatch";

const SOURCE = "AWS Auto Scaling, EC2, ELBv2, CloudWatch";
const CACHE_TTL_MS = 15_000;

type Settled<T> = { ok: true; value: T } | { ok: false; error: PanelError };

/** Runs one AWS read; retries once with jitter on throttling. Never throws. */
export async function settle<T>(source: PanelSource, run: () => Promise<T>): Promise<Settled<T>> {
  try {
    try {
      return { ok: true, value: await run() };
    } catch (err) {
      if (classify(err) !== "AWS_THROTTLED") throw err;
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
      return { ok: true, value: await run() };
    }
  } catch (err) {
    return { ok: false, error: normalizeAwsError(err, source) };
  }
}

export interface Resolved<T> {
  httpStatus: number;
  body: T;
}

function contextOf(ctx: AwsContext): ResourceContext {
  return {
    region: ctx.region,
    asgName: ctx.asgName,
    albName: albNameFromArn(ctx.albArn),
    targetGroupName: targetGroupNameFromArn(ctx.targetGroupArn),
  };
}

function statusOf(errors: PanelError[], okPanels: number): ServiceStatus {
  const hard = errors.filter((e) => e.code !== "NO_DATAPOINTS");
  if (okPanels === 0 && hard.length > 0) return "error";
  return hard.length > 0 ? "partial" : "ok";
}

function envelope(ctx: AwsContext, errors: PanelError[], okPanels: number) {
  return {
    status: statusOf(errors, okPanels),
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    context: contextOf(ctx),
    errors,
  };
}

const emptyMetrics = { cpu: null, requests: null, responseTime: null };
const instanceIdsOf = (g: { Instances?: { InstanceId?: string }[] }) =>
  (g.Instances ?? []).flatMap((i) => (i.InstanceId ? [i.InstanceId] : []));

// Cache keys always include the connection id + version, so one user's data is never served to another.
const key = (ctx: AwsContext, name: string) => `${name}:${ctx.connectionId}:${ctx.version}`;

export async function getOverview(ctx: AwsContext, range: RangeKey): Promise<Resolved<OverviewResponse>> {
  const body = await cached(key(ctx, `overview:${range}`), CACHE_TTL_MS, async () => {
    const groupP = settle("autoscaling", () => describeGroup(ctx));
    const targetsP = settle("elbv2", () => getTargetHealth(ctx));
    const eventsP = settle("autoscaling", () => getScalingEvents(ctx, 8));
    const metricsP = groupP.then((g) =>
      settle("cloudwatch", () => getMetrics(ctx, range, g.ok ? instanceIdsOf(g.value) : [])),
    );
    const [group, targets, events, metrics] = await Promise.all([groupP, targetsP, eventsP, metricsP]);

    const errors: PanelError[] = [];
    for (const r of [group, targets, events, metrics]) if (!r.ok) errors.push(r.error);
    if (metrics.ok) {
      for (const s of Object.values(metrics.value)) {
        if (s.latestObservedAt === null) {
          errors.push({
            source: "cloudwatch",
            code: "NO_DATAPOINTS",
            message: `No CloudWatch datapoints returned for ${s.metricName} in this window.`,
          });
        }
      }
    }
    const okPanels = [group, targets, events, metrics].filter((r) => r.ok).length;
    const recentEvents = events.ok ? events.value : [];
    const result: OverviewResponse = {
      ...envelope(ctx, errors, okPanels),
      range,
      capacity: group.ok ? capacityFromGroup(group.value) : null,
      targets: targets.ok ? targets.value : null,
      metrics: metrics.ok ? metrics.value : emptyMetrics,
      recentEvents,
      lastActivityAt: recentEvents[0]?.startedAt ?? null,
    };
    return result;
  });
  return { httpStatus: body.status === "error" ? 503 : 200, body };
}

export async function getMetricsOnly(ctx: AwsContext, range: RangeKey): Promise<Resolved<MetricsResponse>> {
  const body = await cached(key(ctx, `metrics:${range}`), CACHE_TTL_MS, async () => {
    const group = await settle("autoscaling", () => describeGroup(ctx));
    const metrics = await settle("cloudwatch", () =>
      getMetrics(ctx, range, group.ok ? instanceIdsOf(group.value) : []),
    );
    const errors: PanelError[] = metrics.ok ? [] : [metrics.error];
    const result: MetricsResponse = {
      ...envelope(ctx, errors, metrics.ok ? 1 : 0),
      range,
      metrics: metrics.ok ? metrics.value : emptyMetrics,
    };
    return result;
  });
  return { httpStatus: body.status === "error" ? 503 : 200, body };
}

export async function getInfrastructure(ctx: AwsContext): Promise<Resolved<InfrastructureResponse>> {
  const body = await cached(key(ctx, "infra"), CACHE_TTL_MS, async () => {
    const groupP = settle("autoscaling", () => describeGroup(ctx));
    const targetsP = settle("elbv2", () => getTargetHealth(ctx));
    const ec2P = groupP.then((g) =>
      g.ok ? settle("ec2", () => getEc2Details(ctx, instanceIdsOf(g.value))) : null,
    );
    const [group, targets, ec2] = await Promise.all([groupP, targetsP, ec2P]);

    const errors: PanelError[] = [];
    if (!group.ok) errors.push(group.error);
    if (!targets.ok) errors.push(targets.error);
    if (ec2 && !ec2.ok) errors.push(ec2.error);

    const targetById = new Map(targets.ok ? targets.value.targets.map((t) => [t.targetId, t]) : []);
    const detail = ec2 && ec2.ok ? ec2.value : new Map();
    const instances: InstanceRow[] = group.ok
      ? (group.value.Instances ?? []).map((i) => {
          const id = i.InstanceId ?? "unknown";
          const d = detail.get(id);
          const t = targetById.get(id);
          return {
            instanceId: id,
            ec2State: d?.state ?? null,
            asgLifecycle: i.LifecycleState ?? "Unknown",
            asgHealth: i.HealthStatus ?? "Unknown",
            availabilityZone: d?.availabilityZone ?? i.AvailabilityZone ?? null,
            instanceType: d?.instanceType ?? i.InstanceType ?? null,
            launchTime: d?.launchTime ?? null,
            albTargetHealth: targets.ok ? (t?.state ?? null) : null,
            albTargetReason: t?.reason ?? null,
          };
        })
      : [];
    const okPanels = [group, targets].filter((r) => r.ok).length;
    const result: InfrastructureResponse = {
      ...envelope(ctx, errors, okPanels),
      capacity: group.ok ? capacityFromGroup(group.value) : null,
      instances,
      targets: targets.ok ? targets.value : null,
    };
    return result;
  });
  return { httpStatus: body.status === "error" ? 503 : 200, body };
}

export async function getEvents(ctx: AwsContext, limit: number): Promise<Resolved<EventsResponse>> {
  const body = await cached(key(ctx, `events:${limit}`), CACHE_TTL_MS, async () => {
    const events = await settle("autoscaling", () => getScalingEvents(ctx, limit));
    const errors: PanelError[] = events.ok ? [] : [events.error];
    const result: EventsResponse = {
      ...envelope(ctx, errors, events.ok ? 1 : 0),
      events: events.ok ? events.value : [],
    };
    return result;
  });
  return { httpStatus: body.status === "error" ? 503 : 200, body };
}
