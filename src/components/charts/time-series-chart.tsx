"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNumber, fmtUtcTime } from "@/lib/utils/format";
import type { TimePoint } from "@/types/api";

interface Props {
  points: TimePoint[];
  kind: "line" | "bar";
  color: string;
  /** Applied to raw values for display only (e.g. seconds -> ms). */
  scale?: number;
  unitLabel: string;
  seriesLabel: string;
  yMax?: number;
  digits?: number;
  height?: number;
}

export function TimeSeriesChart({
  points,
  kind,
  color,
  scale = 1,
  unitLabel,
  seriesLabel,
  yMax,
  digits = 1,
  height = 240,
}: Props) {
  // null stays null: Recharts renders a gap, never a zero.
  const data = points.map((p) => ({
    t: Date.parse(p.timestamp),
    v: p.value === null ? null : p.value * scale,
  }));
  const common = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
  };
  const axis = {
    stroke: "#67717c",
    fontSize: 11,
    tickLine: true,
  };
  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={["dataMin", "dataMax"]}
      tickFormatter={(t: number) => fmtUtcTime(new Date(t).toISOString(), false).replace(" UTC", "")}
      tickCount={6}
      {...axis}
    />
  );
  const yAxis = (
    <YAxis
      width={48}
      domain={[0, yMax ?? "auto"]}
      tickFormatter={(v: number) => fmtNumber(v, digits)}
      {...axis}
    />
  );
  const tooltip = (
    <Tooltip
      cursor={{ stroke: "#a9b0b8", strokeWidth: 1 }}
      content={({ active, payload }) => {
        if (!active || !payload?.length) return null;
        const row = payload[0]?.payload as { t: number; v: number | null } | undefined;
        if (!row) return null;
        return (
          <div className="panel mono px-2.5 py-1.5 text-[11.5px] shadow-none">
            <div className="text-muted">{fmtUtcTime(new Date(row.t).toISOString())}</div>
            <div>
              {seriesLabel}:{" "}
              <strong>{row.v === null ? "no datapoint" : `${fmtNumber(row.v, digits)} ${unitLabel}`}</strong>
            </div>
          </div>
        );
      }}
    />
  );

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {kind === "line" ? (
          <LineChart {...common}>
            <CartesianGrid stroke="#e6e5de" vertical={false} />
            {xAxis}
            {yAxis}
            {tooltip}
            <Line
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3.5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        ) : (
          <BarChart {...common}>
            <CartesianGrid stroke="#e6e5de" vertical={false} />
            {xAxis}
            {yAxis}
            {tooltip}
            <Bar dataKey="v" fill={color} isAnimationActive={false} radius={[1, 1, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
