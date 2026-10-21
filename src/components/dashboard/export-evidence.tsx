"use client";

import type { OverviewResponse } from "@/types/api";

export function ExportEvidence({ data, stale }: { data: OverviewResponse | null; stale: boolean }) {
  function download() {
    if (!data) return;
    const blob = new Blob([JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      stale,
      note: "Read-only AWS snapshot. TargetResponseTime is target latency in seconds, not end-to-end latency. RequestCount is per period. Missing points are null. This snapshot alone does not prove traffic caused scaling.",
      overview: data,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scaleops-evidence-${data.fetchedAt.replace(/[:.]/g, "-")}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <button type="button" disabled={!data} onClick={download} className="min-h-10 rounded border border-hairline bg-panel px-3 text-[12px] disabled:opacity-50">Export evidence JSON</button>;
}
