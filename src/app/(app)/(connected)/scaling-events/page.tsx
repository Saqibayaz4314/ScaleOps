"use client";

import { useState } from "react";
import { GroupedEvents, STATUS_LABEL } from "@/components/events/events-timeline";
import { EnvironmentStrip, PageHeader } from "@/components/shell/environment-strip";
import { EmptyState, ErrorNotice, Panel, PanelSkeleton } from "@/components/ui/primitives";
import { useLiveData } from "@/hooks/use-live-data";
import { fmtUtcTime } from "@/lib/utils/format";
import type { ActivityStatus, EventsResponse } from "@/types/api";

type Filter = "all" | ActivityStatus;
const FILTERS: Filter[] = ["all", "Successful", "InProgress", "Failed", "Cancelled"];

export default function ScalingEventsPage() {
  const { data, phase, failure, lastOkAt, refresh } = useLiveData<EventsResponse>("/api/scaling-events?limit=50");
  const [filter, setFilter] = useState<Filter>("all");

  const events = (data?.events ?? []).filter((e) => filter === "all" || e.status === filter);

  return (
    <>
      <EnvironmentStrip
        context={data?.context ?? null}
        phase={phase}
        status={data?.status}
        fetchedAt={data?.fetchedAt ?? null}
        lastOkAt={lastOkAt}
        onRefresh={refresh}
      />
      <PageHeader
        title="Scaling activity ledger"
        lead="Activities exactly as AWS Auto Scaling reports them. Some are health replacements or refreshes rather than traffic-driven scaling."
      />
      <div className="space-y-4 px-4 pb-6 pt-3 sm:px-6 lg:px-9">
        {phase === "stale" && failure && (
          <ErrorNotice
            title={`STALE · last updated ${lastOkAt ? fmtUtcTime(new Date(lastOkAt).toISOString(), false) : "—"}. Latest refresh failed.`}
            errors={failure}
          />
        )}
        {phase === "error" && failure && <ErrorNotice title="Cannot load AWS data" errors={failure} />}
        {phase !== "stale" && data && data.errors.length > 0 && (
          <ErrorNotice title="Scaling activity could not be loaded" errors={data.errors} />
        )}

        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`min-h-10 rounded-[4px] border px-3 text-[12px] ${
                filter === f ? "border-ink bg-ink font-semibold text-white" : "border-hairline bg-panel hover:border-ink"
              }`}
            >
              {f === "all" ? "All" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        <Panel
          title="Activity history"
          eyebrow="EC2 Auto Scaling"
          footnote="Source: DescribeScalingActivities (latest 50). Copper rule = AWS text states a capacity change. Capacity numbers are shown only when present in AWS' own cause text."
        >
          {phase === "loading" ? (
            <PanelSkeleton height={300} />
          ) : !data ? null : data.events.length === 0 && data.errors.length === 0 ? (
            <EmptyState title="No scaling activity recorded" detail="AWS returned an empty history for this group. That is valid, not an error." />
          ) : events.length === 0 ? (
            <EmptyState title="No activities match this filter" />
          ) : (
            <GroupedEvents events={events} />
          )}
        </Panel>
      </div>
    </>
  );
}
