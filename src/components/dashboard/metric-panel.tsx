"use client";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { fmtNumber, fmtUtcTime } from "@/lib/utils/format";
import type { MetricSeries, RangeKey } from "@/types/api";

interface Props {
  title: string;
  eyebrow: string;
  series: MetricSeries | null;
  kind: "line" | "bar";
  color: string;
  scale?: number;
  unitLabel: string;
  digits?: number;
  yMax?: number;
  range: RangeKey;
  /** Shown instead of the chart when the whole metrics fetch failed. */
  unavailableReason?: string;
  /** How to summarise the window: latest sample, or total across the window. */
  summary: "latest" | "total";
}

export function MetricPanel({
  title,
  eyebrow,
  series,
  kind,
  color,
  scale = 1,
  unitLabel,
  digits = 1,
  yMax,
  range,
  unavailableReason,
  summary,
}: Props) {
  const real = series?.points.filter((p) => p.value !== null) ?? [];
  const values = real.map((p) => (p.value as number) * scale);
  const last = real[real.length - 1];
  const total = values.reduce((a, b) => a + b, 0);

  let headline = "—";
  let sub = "no datapoints in window";
  if (last) {
    if (summary === "latest") {
      headline = `${fmtNumber((last.value as number) * scale, digits)} ${unitLabel}`;
      sub = `latest sample · observed ${fmtUtcTime(last.timestamp)}`;
    } else {
      headline = `${fmtNumber(total, 0)} ${unitLabel}`;
      sub = `total over ${range} · latest period ${fmtUtcTime(last.timestamp, false)}`;
    }
  }

  return (
    <Panel
      title={title}
      eyebrow={eyebrow}
      footnote={
        series ? (
          <>
            Source: CloudWatch {series.namespace} · {series.metricName} · {series.statistic} ·{" "}
            {series.periodSeconds / 60}-min periods. {series.aggregationNote} Gaps mean no datapoint, not zero.
          </>
        ) : (
          "Source: CloudWatch"
        )
      }
    >
      {!series ? (
        <EmptyState title="Metric unavailable" detail={unavailableReason ?? "CloudWatch did not return this series."} />
      ) : real.length === 0 ? (
        <EmptyState
          title="No CloudWatch datapoints returned for this window."
          detail={`Try a longer range${range === "6h" ? "" : " (3h or 6h)"}. EC2 basic monitoring publishes CPU every 5 minutes, and ALB metrics only appear once traffic has reached the load balancer.`}
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="metric-number text-[28px]">{headline}</span>
            <span className="mono text-[11px] text-muted">{sub}</span>
          </div>
          <TimeSeriesChart
            points={series.points}
            kind={kind}
            color={color}
            scale={scale}
            unitLabel={unitLabel}
            seriesLabel={series.metricName}
            digits={digits}
            yMax={yMax}
          />
          <details className="mt-3 text-[12px]">
            <summary className="cursor-pointer text-muted hover:text-ink">View datapoints as a table</summary>
            <div className="mt-2 max-h-48 overflow-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Period start (UTC)</th>
                    <th className="th">{series.metricName} ({unitLabel})</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series.points].reverse().map((p) => (
                    <tr key={p.timestamp}>
                      <td className="td mono">{fmtUtcTime(p.timestamp)}</td>
                      <td className="td mono">
                        {p.value === null ? "no datapoint" : fmtNumber(p.value * scale, digits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Panel>
  );
}
