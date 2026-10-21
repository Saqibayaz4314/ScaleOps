"use client";

import { RefreshCw } from "lucide-react";
import type { Phase } from "@/hooks/use-live-data";
import { fmtUtcTime } from "@/lib/utils/format";
import type { ResourceContext, ServiceStatus } from "@/types/api";

type Conn = { label: string; tone: string; dot: string };

export function connectionState(phase: Phase, status: ServiceStatus | undefined): Conn {
  if (phase === "loading") return { label: "CONNECTING", tone: "text-muted", dot: "bg-quiet" };
  if (phase === "error") return { label: "DISCONNECTED", tone: "text-critical", dot: "bg-critical" };
  if (phase === "stale") return { label: "DELAYED · STALE", tone: "text-copper", dot: "bg-copper" };
  if (status === "error") return { label: "AWS ERROR", tone: "text-critical", dot: "bg-critical" };
  if (status === "partial") return { label: "PARTIAL DATA", tone: "text-copper", dot: "bg-copper" };
  return { label: "LIVE DATA", tone: "text-success", dot: "bg-success" };
}

export function EnvironmentStrip({
  context,
  phase,
  status,
  fetchedAt,
  lastOkAt,
  onRefresh,
}: {
  context: ResourceContext | null;
  phase: Phase;
  status: ServiceStatus | undefined;
  fetchedAt: string | null;
  lastOkAt: number | null;
  onRefresh: () => void;
}) {
  const conn = connectionState(phase, status);
  const busy = phase === "loading" || phase === "refreshing";
  const staleSince = phase === "stale" && lastOkAt ? fmtUtcTime(new Date(lastOkAt).toISOString(), false) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-hairline bg-panel px-4 py-3 text-[12px] sm:px-6 lg:px-9">
      <span className="eyebrow">Operations / 01</span>
      <span className="mono">
        {context?.region ? (
          <>
            PROD · {context.region} · <span className="text-muted">ASG</span> {context.asgName}
          </>
        ) : (
          "— region not resolved —"
        )}
      </span>
      <span className="mono text-muted">
        fetched {fetchedAt ? fmtUtcTime(fetchedAt) : "—"}
        {staleSince ? ` · STALE since ${staleSince}` : ""}
      </span>
      <span className={`mono flex items-center gap-1.5 font-medium ${conn.tone}`} role="status">
        <span className={`inline-block h-2 w-2 rounded-full ${conn.dot} ${busy ? "pulse-dot" : ""}`} aria-hidden="true" />
        {conn.label}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        className="ml-auto flex min-h-10 items-center gap-2 rounded-[4px] border border-hairline px-3 text-[12px] font-medium hover:border-ink disabled:opacity-60"
      >
        <RefreshCw size={14} className={busy ? "animate-spin" : ""} aria-hidden="true" />
        {busy ? "Refreshing" : "Refresh"}
      </button>
    </div>
  );
}

export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="px-4 pb-2 pt-6 sm:px-6 lg:px-9 lg:pt-8">
      <h1 className="text-[29px] font-semibold leading-tight tracking-[-0.035em] lg:text-[32px]">{title}</h1>
      <p className="mt-1 max-w-3xl text-[13.5px] text-muted">{lead}</p>
    </div>
  );
}
