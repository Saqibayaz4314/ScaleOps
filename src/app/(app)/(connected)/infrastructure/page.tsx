"use client";

import { InstancesTable } from "@/components/infrastructure/instances-table";
import { EnvironmentStrip, PageHeader } from "@/components/shell/environment-strip";
import { HealthSummary } from "@/components/dashboard/health-summary";
import { ErrorNotice, Panel, PanelSkeleton } from "@/components/ui/primitives";
import { useLiveData } from "@/hooks/use-live-data";
import { fmtUtcTime } from "@/lib/utils/format";
import type { InfrastructureResponse } from "@/types/api";

function Field({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 last:border-b-0">
      <dt className="eyebrow">{k}</dt>
      <dd className="mono text-[12.5px]">{v}</dd>
    </div>
  );
}

export default function InfrastructurePage() {
  const { data, phase, failure, lastOkAt, refresh } = useLiveData<InfrastructureResponse>("/api/infrastructure");
  const errs = data?.errors ?? [];
  const targetsError = errs.find((e) => e.source === "elbv2");
  const c = data?.capacity;

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
        title="Resource inventory"
        lead="Three different signals: EC2 state, Auto Scaling lifecycle and ALB target health. They can disagree, and that is information."
      />
      <div className="space-y-4 px-4 pb-6 pt-3 sm:px-6 lg:px-9">
        {phase === "stale" && failure && (
          <ErrorNotice
            title={`STALE · last updated ${lastOkAt ? fmtUtcTime(new Date(lastOkAt).toISOString(), false) : "—"}. Latest refresh failed.`}
            errors={failure}
          />
        )}
        {phase === "error" && failure && <ErrorNotice title="Cannot load AWS data" errors={failure} />}
        {phase !== "stale" && errs.length > 0 && <ErrorNotice title="Some data could not be loaded" errors={errs} />}

        {phase === "loading" ? (
          <div className="panel p-4"><PanelSkeleton height={260} /></div>
        ) : (
          data && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Auto Scaling group" eyebrow="Configuration" footnote="Source: EC2 Auto Scaling DescribeAutoScalingGroups.">
                  <dl>
                    <Field k="Group" v={data.context.asgName} />
                    <Field k="Region" v={data.context.region} />
                    <Field k="Min / desired / max" v={c ? `${c.min} / ${c.desired} / ${c.max}` : "—"} />
                    <Field k="In service" v={c?.inService ?? "—"} />
                    <Field k="Pending / terminating" v={c ? `${c.pending} / ${c.terminating}` : "—"} />
                    <Field k="Load balancer" v={data.context.albName ?? "—"} />
                    <Field k="Target group" v={data.context.targetGroupName ?? "—"} />
                  </dl>
                </Panel>
                <HealthSummary targets={data.targets} unavailable={targetsError?.message} />
              </div>

              {data.targets && (
                <p className="mono text-[11.5px] text-muted">
                  Targets — healthy {data.targets.healthy} · unhealthy {data.targets.unhealthy} · initial{" "}
                  {data.targets.initial} · draining {data.targets.draining} · unused {data.targets.unused} ·
                  unavailable {data.targets.unavailable}
                </p>
              )}

              <Panel
                title="Instances"
                eyebrow="EC2 · Auto Scaling · ALB"
                footnote="Sources: EC2 DescribeInstances (state, type, AZ, launch time), Auto Scaling (lifecycle, health), ELBv2 DescribeTargetHealth (target health). Only this group's instances are queried."
              >
                <InstancesTable rows={data.instances} />
              </Panel>
            </>
          )
        )}
      </div>
    </>
  );
}
