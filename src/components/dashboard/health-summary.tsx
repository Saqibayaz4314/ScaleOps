import { EmptyState, Panel, StatusPill } from "@/components/ui/primitives";
import type { AlbTargetState, TargetSummary } from "@/types/api";

export const TARGET_TONE: Record<AlbTargetState, "ok" | "warn" | "bad" | "neutral" | "info"> = {
  healthy: "ok",
  unhealthy: "bad",
  initial: "info",
  draining: "warn",
  unused: "neutral",
  unavailable: "bad",
  unknown: "neutral",
};

export function HealthSummary({ targets, unavailable }: { targets: TargetSummary | null; unavailable?: string }) {
  return (
    <Panel
      title="Target health"
      eyebrow="Application Load Balancer"
      footnote="Source: Elastic Load Balancing DescribeTargetHealth. ALB health is independent of ASG lifecycle state."
    >
      {!targets ? (
        <EmptyState title="Target health unavailable" detail={unavailable} />
      ) : targets.targets.length === 0 ? (
        <EmptyState title="No registered targets" detail="The target group currently has no targets registered." />
      ) : (
        <ul className="divide-y divide-hairline">
          {targets.targets.map((t) => (
            <li key={t.targetId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="mono text-[12px]">{t.targetId}</span>
              <span className="flex items-center gap-2">
                {t.reason && <span className="mono text-[10.5px] text-muted">{t.reason}</span>}
                <StatusPill tone={TARGET_TONE[t.state]}>{t.state}</StatusPill>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
