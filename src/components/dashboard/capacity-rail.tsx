import { fmtNumber, fmtUtcTime } from "@/lib/utils/format";
import type { CapacitySnapshot, MetricSeries, TargetSummary } from "@/types/api";

function latest(series: MetricSeries | null) {
  if (!series?.latestObservedAt) return null;
  const p = [...series.points].reverse().find((x) => x.value !== null);
  return p ? { value: p.value as number, at: p.timestamp } : null;
}

function Stat({
  label,
  value,
  note,
  tone = "",
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 flex-1 px-0 py-4 sm:px-5 sm:first:pl-0">
      <div className="eyebrow">{label}</div>
      <div className={`metric-number mt-2 text-[38px] ${tone}`}>{value}</div>
      <div className="mono mt-2 text-[11px] leading-snug text-muted">{note}</div>
    </div>
  );
}

/** Segmented min / desired / max indicator: one cell per possible instance slot. */
function Slots({ c }: { c: CapacitySnapshot }) {
  const total = Math.max(c.max, c.desired, c.inService, 1);
  return (
    <div>
      <div className="flex gap-1" role="img" aria-label={`Capacity slots: ${c.inService} in service, ${c.desired} desired, minimum ${c.min}, maximum ${c.max}`}>
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const filled = n <= c.inService;
          const wanted = n <= c.desired;
          const belowMin = n <= c.min;
          return (
            <div
              key={n}
              title={`Slot ${n}${belowMin ? " (guaranteed by minimum)" : ""}`}
              className={`h-3 flex-1 border ${
                filled ? "border-cobalt bg-cobalt" : wanted ? "border-copper bg-copper/25" : "border-hairline bg-chalk"
              }`}
            />
          );
        })}
      </div>
      <div className="mono mt-2 flex justify-between text-[11px] text-muted">
        <span>min {c.min}</span>
        <span>desired {c.desired}</span>
        <span>max {c.max}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Filled = InService in ASG · outlined copper = desired but not yet in service
        {c.pending > 0 ? ` · ${c.pending} pending` : ""}
        {c.terminating > 0 ? ` · ${c.terminating} terminating` : ""}
      </p>
    </div>
  );
}

export function CapacityRail({
  capacity,
  targets,
  cpu,
}: {
  capacity: CapacitySnapshot | null;
  targets: TargetSummary | null;
  cpu: MetricSeries | null;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const cpuLatest = latest(cpu);
  const unhealthy = targets ? targets.unhealthy + targets.unavailable : 0;
  return (
    <section aria-label="Capacity" className="panel">
      <div className="flex flex-col divide-y divide-hairline px-4 sm:flex-row sm:divide-x sm:divide-y-0 sm:px-5">
        <Stat
          label="Desired"
          value={capacity ? pad(capacity.desired) : "—"}
          note={capacity ? `ASG DesiredCapacity · min ${capacity.min} / max ${capacity.max}` : "ASG data unavailable"}
        />
        <Stat
          label="In service"
          value={capacity ? pad(capacity.inService) : "—"}
          note={capacity ? `ASG lifecycle InService · ${capacity.pending} pending` : "ASG data unavailable"}
        />
        <Stat
          label="Healthy targets"
          value={targets ? pad(targets.healthy) : "—"}
          tone={targets && unhealthy > 0 ? "text-critical" : ""}
          note={
            targets
              ? `ALB target health · ${targets.unhealthy} unhealthy · ${targets.initial} initial`
              : "Target health unavailable"
          }
        />
        <Stat
          label="CPU (ASG avg)"
          value={cpuLatest ? `${fmtNumber(cpuLatest.value, 1)}%` : "—"}
          note={
            cpuLatest
              ? `5-min average · observed ${fmtUtcTime(cpuLatest.at, false)}`
              : "no datapoints in window"
          }
        />
      </div>
      {capacity && (
        <div className="border-t border-hairline px-4 py-3 sm:px-5">
          <Slots c={capacity} />
        </div>
      )}
    </section>
  );
}
