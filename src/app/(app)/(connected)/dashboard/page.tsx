"use client";

import Link from "next/link";
import { useState } from "react";
import { CapacityChart } from "@/components/dashboard/capacity-chart";
import { CapacityRail } from "@/components/dashboard/capacity-rail";
import { ExportEvidence } from "@/components/dashboard/export-evidence";
import { HealthSummary } from "@/components/dashboard/health-summary";
import { MetricPanel } from "@/components/dashboard/metric-panel";
import { EventsList } from "@/components/events/events-timeline";
import { EnvironmentStrip, PageHeader } from "@/components/shell/environment-strip";
import { EmptyState, ErrorNotice, Panel, PanelSkeleton, Skeleton } from "@/components/ui/primitives";
import { useLiveData } from "@/hooks/use-live-data";
import { fmtUtcTime } from "@/lib/utils/format";
import type { OverviewResponse, RangeKey } from "@/types/api";

const RANGES: RangeKey[] = ["1h", "3h", "6h"];

export default function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("1h");
  const { data, phase, failure, lastOkAt, refresh } = useLiveData<OverviewResponse>(
    `/api/overview?range=${range}`,
  );

  const hardErrors = data?.errors.filter((e) => e.code !== "NO_DATAPOINTS") ?? [];
  const metricsError = data?.errors.find((e) => e.source === "cloudwatch" && e.code !== "NO_DATAPOINTS");
  const targetsError = data?.errors.find((e) => e.source === "elbv2");
  const loading = phase === "loading";

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
        title="Capacity, under pressure."
        lead="Telemetry from AWS Auto Scaling, Application Load Balancer and CloudWatch."
      />

      <div className="space-y-4 px-4 pb-6 pt-3 sm:px-6 lg:px-9">
        {phase === "stale" && failure && (
          <ErrorNotice
            title={`STALE · last updated ${lastOkAt ? fmtUtcTime(new Date(lastOkAt).toISOString(), false) : "—"}. Showing the previous result; the latest refresh failed.`}
            errors={failure}
          />
        )}
        {phase === "error" && failure && <ErrorNotice title="Cannot load AWS data" errors={failure} />}
        {phase !== "stale" && hardErrors.length > 0 && (
          <ErrorNotice title="Some panels could not be loaded" errors={hardErrors} />
        )}

        {loading ? (
          <>
            <div className="panel p-5"><Skeleton className="h-24 w-full" /></div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <div className="panel p-4"><PanelSkeleton /></div>
              <div className="panel p-4"><PanelSkeleton /></div>
            </div>
          </>
        ) : (
          data && (
            <>
              <CapacityRail capacity={data.capacity} targets={data.targets} cpu={data.metrics.cpu} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="eyebrow">Load · selected window</div>
                  <ExportEvidence data={data} stale={phase === "stale"} />
                </div>
                <div role="group" aria-label="Time range" className="flex overflow-hidden rounded-[4px] border border-hairline bg-panel">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={range === r}
                      onClick={() => setRange(r)}
                      className={`mono min-h-10 min-w-14 px-3 text-[12px] ${
                        range === r ? "bg-ink font-semibold text-white" : "hover:bg-chalk"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <MetricPanel
                  title="CPU utilization"
                  eyebrow="EC2 · Auto Scaling group"
                  series={data.metrics.cpu}
                  kind="line"
                  color="#365bcc"
                  unitLabel="%"
                  yMax={100}
                  range={range}
                  summary="latest"
                  unavailableReason={metricsError?.message}
                />
                <MetricPanel
                  title="ALB request count"
                  eyebrow="Application Load Balancer"
                  series={data.metrics.requests}
                  kind="bar"
                  color="#db6749"
                  unitLabel="req"
                  digits={0}
                  range={range}
                  summary="total"
                  unavailableReason={metricsError?.message}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <MetricPanel
                  title="Target response time"
                  eyebrow="Application Load Balancer"
                  series={data.metrics.responseTime}
                  kind="line"
                  color="#2f3640"
                  scale={1000}
                  unitLabel="ms"
                  digits={1}
                  range={range}
                  summary="latest"
                  unavailableReason={metricsError?.message}
                />
                <HealthSummary targets={data.targets} unavailable={targetsError?.message} />
              </div>

              <CapacityChart
                inService={data.metrics.inService}
                desired={data.metrics.desired}
                capacity={data.capacity}
                range={range}
              />

              <Panel
                title="Recent scaling activity"
                eyebrow="EC2 Auto Scaling"
                actions={
                  <Link href="/scaling-events" className="text-[12px] font-medium text-cobalt hover:underline">
                    View all →
                  </Link>
                }
                footnote="Source: EC2 Auto Scaling DescribeScalingActivities. Includes health replacements and refreshes, not only traffic-driven scaling."
              >
                {data.recentEvents.length === 0 ? (
                  <EmptyState
                    title="No scaling activity recorded"
                    detail="AWS returned an empty activity history for this group."
                  />
                ) : (
                  <EventsList events={data.recentEvents} />
                )}
              </Panel>
            </>
          )
        )}
      </div>
    </>
  );
}
