import "server-only";
import {
  GetMetricDataCommand,
  type MetricDataQuery,
  type MetricDataResult,
} from "@aws-sdk/client-cloudwatch";
import {
  RANGES,
  buildPoints,
  deriveAlbDimension,
  hasData,
  makeSeries,
  meanAcrossSeries,
} from "@/lib/data/normalize";
import type { MetricSeries, RangeKey } from "@/types/api";
import type { AwsContext } from "./context";
import { callOptions, clientsFor } from "./clients";

const MAX_PAGES = 5;

async function fetchMetricData(
  ctx: AwsContext,
  queries: MetricDataQuery[],
  start: Date,
  end: Date,
): Promise<Map<string, MetricDataResult>> {
  const merged = new Map<string, { Timestamps: Date[]; Values: number[] }>();
  let token: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const out = await clientsFor(ctx).cw.send(
      new GetMetricDataCommand({
        MetricDataQueries: queries,
        StartTime: start,
        EndTime: end,
        ScanBy: "TimestampAscending",
        NextToken: token,
      }),
      callOptions(),
    );
    for (const r of out.MetricDataResults ?? []) {
      if (!r.Id) continue;
      const e = merged.get(r.Id) ?? { Timestamps: [], Values: [] };
      e.Timestamps.push(...(r.Timestamps ?? []));
      e.Values.push(...(r.Values ?? []));
      merged.set(r.Id, e);
    }
    token = out.NextToken;
    if (!token) break;
  }
  return new Map([...merged].map(([id, v]) => [id, { Id: id, ...v }]));
}

export interface MetricsResult {
  cpu: MetricSeries;
  requests: MetricSeries;
  responseTime: MetricSeries;
  inService: MetricSeries;
  desired: MetricSeries;
}

/**
 * One GetMetricData call for CPU (ASG aggregate), RequestCount and TargetResponseTime.
 * If the ASG-dimension CPU series is empty, falls back to a per-instance mean that is
 * labelled as such (never presented as an AWS-native ASG aggregate).
 */
export async function getMetrics(
  ctx: AwsContext,
  range: RangeKey,
  instanceIds: string[],
): Promise<MetricsResult> {
  const spec = RANGES[range];
  const end = new Date();
  const start = new Date(end.getTime() - spec.durationMs);
  const lb = deriveAlbDimension(ctx.albArn);

  const queries: MetricDataQuery[] = [
    {
      Id: "cpu",
      ReturnData: true,
      MetricStat: {
        Metric: {
          Namespace: "AWS/EC2",
          MetricName: "CPUUtilization",
          Dimensions: [{ Name: "AutoScalingGroupName", Value: ctx.asgName }],
        },
        Period: spec.cpuPeriod,
        Stat: "Average",
        Unit: "Percent",
      },
    },
    {
      Id: "req",
      ReturnData: true,
      MetricStat: {
        Metric: {
          Namespace: "AWS/ApplicationELB",
          MetricName: "RequestCount",
          Dimensions: [{ Name: "LoadBalancer", Value: lb }],
        },
        Period: spec.albPeriod,
        Stat: "Sum",
      },
    },
    {
      Id: "rt",
      ReturnData: true,
      MetricStat: {
        Metric: {
          Namespace: "AWS/ApplicationELB",
          MetricName: "TargetResponseTime",
          Dimensions: [{ Name: "LoadBalancer", Value: lb }],
        },
        Period: spec.albPeriod,
        Stat: "Average",
      },
    },
    ...(["GroupInServiceInstances", "GroupDesiredCapacity"] as const).map(
      (metricName, i): MetricDataQuery => ({
        Id: i === 0 ? "gis" : "gdc",
        ReturnData: true,
        MetricStat: {
          Metric: {
            Namespace: "AWS/AutoScaling",
            MetricName: metricName,
            Dimensions: [{ Name: "AutoScalingGroupName", Value: ctx.asgName }],
          },
          Period: spec.albPeriod,
          Stat: "Average",
        },
      }),
    ),
  ];

  const results = await fetchMetricData(ctx, queries, start, end);
  const startMs = start.getTime();
  const endMs = end.getTime();

  let cpuPoints = buildPoints(
    results.get("cpu")?.Timestamps,
    results.get("cpu")?.Values,
    startMs,
    endMs,
    spec.cpuPeriod,
  );
  let cpuNote =
    "AWS/EC2 CPUUtilization, Average, dimension AutoScalingGroupName (ASG aggregate), 5-minute resolution (EC2 basic monitoring).";

  if (!hasData(cpuPoints) && instanceIds.length > 0) {
    const ids = instanceIds.slice(0, 20);
    const perInstance = await fetchMetricData(
      ctx,
      ids.map((id, i) => ({
        Id: `i${i}`,
        ReturnData: true,
        MetricStat: {
          Metric: {
            Namespace: "AWS/EC2",
            MetricName: "CPUUtilization",
            Dimensions: [{ Name: "InstanceId", Value: id }],
          },
          Period: spec.cpuPeriod,
          Stat: "Average" as const,
          Unit: "Percent" as const,
        },
      })),
      start,
      end,
    );
    const mean = meanAcrossSeries(
      [...perInstance.values()].map((r) => ({ timestamps: r.Timestamps, values: r.Values })),
      spec.cpuPeriod,
    );
    const fallback = buildPoints(mean.timestamps, mean.values, startMs, endMs, spec.cpuPeriod);
    if (hasData(fallback)) {
      cpuPoints = fallback;
      cpuNote = `Fallback: mean of per-instance CPUUtilization (Average) across reporting instances (${ids.length} queried). The ASG-level metric returned no datapoints.`;
    }
  }

  const reqPoints = buildPoints(
    results.get("req")?.Timestamps,
    results.get("req")?.Values,
    startMs,
    endMs,
    spec.albPeriod,
  );
  const rtPoints = buildPoints(
    results.get("rt")?.Timestamps,
    results.get("rt")?.Values,
    startMs,
    endMs,
    spec.albPeriod,
  );

  const groupSeries = (id: "gis" | "gdc") =>
    buildPoints(results.get(id)?.Timestamps, results.get(id)?.Values, startMs, endMs, spec.albPeriod);

  return {
    inService: makeSeries(
      {
        id: "inService",
        namespace: "AWS/AutoScaling",
        metricName: "GroupInServiceInstances",
        statistic: "Average",
        unit: "instances",
        periodSeconds: spec.albPeriod,
        aggregationNote: "Instances in service, per-minute group metric (needs Auto Scaling group metrics collection).",
      },
      groupSeries("gis"),
    ),
    desired: makeSeries(
      {
        id: "desired",
        namespace: "AWS/AutoScaling",
        metricName: "GroupDesiredCapacity",
        statistic: "Average",
        unit: "instances",
        periodSeconds: spec.albPeriod,
        aggregationNote: "Desired capacity set by the scaling policy, per-minute group metric.",
      },
      groupSeries("gdc"),
    ),
    cpu: makeSeries(
      {
        id: "cpu",
        namespace: "AWS/EC2",
        metricName: "CPUUtilization",
        statistic: "Average",
        unit: "%",
        periodSeconds: spec.cpuPeriod,
        aggregationNote: cpuNote,
      },
      cpuPoints,
    ),
    requests: makeSeries(
      {
        id: "requests",
        namespace: "AWS/ApplicationELB",
        metricName: "RequestCount",
        statistic: "Sum",
        unit: "count",
        periodSeconds: spec.albPeriod,
        aggregationNote: `Requests received per ${spec.albPeriod}-second period (Sum). Not requests per second.`,
      },
      reqPoints,
    ),
    responseTime: makeSeries(
      {
        id: "responseTime",
        namespace: "AWS/ApplicationELB",
        metricName: "TargetResponseTime",
        statistic: "Average",
        unit: "seconds",
        periodSeconds: spec.albPeriod,
        aggregationNote:
          "Time from ALB to target response, Average per period, in seconds as reported by AWS. Not end-to-end page load time.",
      },
      rtPoints,
    ),
  };
}
