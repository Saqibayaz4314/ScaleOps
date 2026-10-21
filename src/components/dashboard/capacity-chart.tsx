"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { fmtNumber, fmtUtcTime } from "@/lib/utils/format";
import type { CapacitySnapshot, MetricSeries, RangeKey } from "@/types/api";

interface Props {
  inService: MetricSeries | null | undefined;
  desired: MetricSeries | null | undefined;
  capacity: CapacitySnapshot | null;
  range: RangeKey;
}

const hasReal = (s: MetricSeries | null | undefined) => !!s && s.points.some((p) => p.value !== null);

export function CapacityChart({ inService, desired, capacity, range }: Props) {
  const showIn = hasReal(inService);
  const showDes = hasReal(desired);
  const base = (showIn ? inService : desired)?.points ?? [];

  const data = base.map((p, i) => ({
    t: Date.parse(p.timestamp),
    inService: showIn ? (inService?.points[i]?.value ?? null) : null,
    desired: showDes ? (desired?.points[i]?.value ?? null) : null,
  }));
  const peak = Math.max(
    capacity?.max ?? 0,
    ...data.flatMap((d) => [d.inService ?? 0, d.desired ?? 0]),
  );
  const maxValue = Math.max(
    0,
    ...data.flatMap((d) => [d.inService ?? 0, d.desired ?? 0]),
  );
  const axis = { stroke: "#67717c", fontSize: 11, tickLine: true };

  return (
    <Panel
      title="Instance count over time"
      eyebrow="EC2 Auto Scaling · scale-out / scale-in"
      footnote={
        <>
          Source: CloudWatch AWS/AutoScaling GroupInServiceInstances and GroupDesiredCapacity ·{" "}
          {(inService ?? desired)?.periodSeconds ? ((inService ?? desired)!.periodSeconds / 60) : 1}-min periods.{" "}
          {!showIn && showDes && desired ? desired.aggregationNote : "Gaps mean no datapoint, not zero."}
        </>
      }
    >
      {!showIn && !showDes ? (
        <EmptyState
          title="No instance-count datapoints in this window."
          detail="Group metrics are published only after Auto Scaling group metrics collection is enabled (Terraform enabled_metrics) and the group has run for a few minutes. Try 3h or 6h."
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="metric-number text-[28px]">
              {capacity ? `${capacity.inService} → ${capacity.desired}` : "—"}
            </span>
            <span className="mono text-[11px] text-muted">
              in service → desired now · peak in window {fmtNumber(maxValue, 0)} · {range}
            </span>
          </div>
          <div style={{ height: 240 }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e6e5de" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t: number) =>
                    fmtUtcTime(new Date(t).toISOString(), false).replace(" UTC", "")
                  }
                  tickCount={6}
                  {...axis}
                />
                <YAxis width={32} allowDecimals={false} domain={[0, peak || "auto"]} {...axis} />
                {capacity && (
                  <ReferenceLine
                    y={capacity.max}
                    stroke="#a9b0b8"
                    strokeDasharray="4 3"
                    label={{ value: `max ${capacity.max}`, fontSize: 10, fill: "#67717c", position: "insideTopRight" }}
                  />
                )}
                <Tooltip
                  cursor={{ stroke: "#a9b0b8", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as
                      | { t: number; inService: number | null; desired: number | null }
                      | undefined;
                    if (!row) return null;
                    return (
                      <div className="panel mono px-2.5 py-1.5 text-[11.5px] shadow-none">
                        <div className="text-muted">{fmtUtcTime(new Date(row.t).toISOString())}</div>
                        {showIn && <div>In service: <strong>{row.inService === null ? "no datapoint" : fmtNumber(row.inService, 0)}</strong></div>}
                        {showDes && <div>Desired: <strong>{row.desired === null ? "no datapoint" : fmtNumber(row.desired, 0)}</strong></div>}
                      </div>
                    );
                  }}
                />
                {showDes && (
                  <Line
                    type="stepAfter"
                    dataKey="desired"
                    stroke="#db6749"
                    strokeWidth={1.75}
                    strokeDasharray="5 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                {showIn && (
                  <Line
                    type="stepAfter"
                    dataKey="inService"
                    stroke="#365bcc"
                    strokeWidth={2.25}
                    dot={false}
                    activeDot={{ r: 3.5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mono mt-2 flex gap-4 text-[11px] text-muted">
            {showIn && <span><span style={{ color: "#365bcc" }}>━</span> in service</span>}
            {showDes && <span><span style={{ color: "#db6749" }}>╍</span> desired</span>}
            <span>┈ max size</span>
          </div>
        </>
      )}
    </Panel>
  );
}
