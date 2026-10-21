import { StatusPill } from "@/components/ui/primitives";
import { fmtUtcDate, fmtUtcTime } from "@/lib/utils/format";
import type { ActivityStatus, ScalingEvent } from "@/types/api";

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  Successful: "Successful",
  InProgress: "In progress",
  Failed: "Failed",
  Cancelled: "Cancelled",
  Other: "Unknown",
};
const STATUS_TONE = {
  Successful: "ok",
  InProgress: "info",
  Failed: "bad",
  Cancelled: "neutral",
  Other: "neutral",
} as const;

/** A capacity-affecting candidate: AWS' own text states a capacity change. */
const isCapacityEvent = (e: ScalingEvent) => e.capacityChange !== null;

export function EventRow({ event }: { event: ScalingEvent }) {
  const change = event.capacityChange;
  return (
    <li className="grid grid-cols-[84px_1fr] gap-x-4 border-b border-hairline py-3 last:border-b-0 sm:grid-cols-[110px_1fr]">
      <div className="mono text-[12px] leading-tight">
        <div>{fmtUtcTime(event.startedAt, true).replace(" UTC", "")}</div>
        <div className="text-[10.5px] text-muted">UTC</div>
      </div>
      <div className={`min-w-0 border-l-2 pl-4 ${isCapacityEvent(event) ? "border-copper" : "border-hairline"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</StatusPill>
          {change && (
            <span className="mono text-[11.5px] text-muted">
              capacity {change.from} → {change.to}
            </span>
          )}
          <span className="mono text-[10.5px] text-quiet">{event.activityId}</span>
        </div>
        <p className="mt-1 text-[13px] font-medium">{event.description || "AWS activity"}</p>
        {event.cause && <p className="mt-0.5 break-words text-[12px] leading-snug text-muted">{event.cause}</p>}
        <p className="mono mt-1 text-[11px] text-muted">
          start {fmtUtcTime(event.startedAt)} · end {event.endedAt ? fmtUtcTime(event.endedAt) : "—"}
          {event.progress !== null ? ` · progress ${event.progress}%` : ""}
        </p>
      </div>
    </li>
  );
}

export function EventsList({ events }: { events: ScalingEvent[] }) {
  return (
    <ol>
      {events.map((e) => (
        <EventRow key={e.activityId} event={e} />
      ))}
    </ol>
  );
}

/** Same list, grouped under UTC date headings (full ledger). */
export function GroupedEvents({ events }: { events: ScalingEvent[] }) {
  const groups = new Map<string, ScalingEvent[]>();
  for (const e of events) {
    const d = fmtUtcDate(e.startedAt);
    groups.set(d, [...(groups.get(d) ?? []), e]);
  }
  return (
    <div className="space-y-5">
      {[...groups].map(([date, list]) => (
        <section key={date} aria-label={date}>
          <h3 className="eyebrow mb-1">{date} UTC</h3>
          <EventsList events={list} />
        </section>
      ))}
    </div>
  );
}
