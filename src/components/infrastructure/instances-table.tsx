import { TARGET_TONE } from "@/components/dashboard/health-summary";
import { EmptyState, StatusPill } from "@/components/ui/primitives";
import { fmtUtcDateTime } from "@/lib/utils/format";
import type { InstanceRow } from "@/types/api";

const lifecycleTone = (s: string) =>
  s === "InService" ? "ok" : s.startsWith("Pending") ? "info" : s.startsWith("Terminat") ? "warn" : "neutral";
const ec2Tone = (s: string | null) =>
  s === "running" ? "ok" : s === "pending" ? "info" : s === null ? "neutral" : "warn";

export function InstancesTable({ rows }: { rows: InstanceRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No instances in this Auto Scaling group"
        detail="The group currently has zero instances (desired capacity may be 0, or instances are still launching)."
      />
    );
  }
  return (
    <div className="-m-4 overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse">
        <caption className="sr-only">
          Instances in the Auto Scaling group with EC2 state, ASG lifecycle, ASG health and ALB target health
        </caption>
        <thead>
          <tr>
            <th className="th sticky left-0 bg-panel">Instance</th>
            <th className="th">EC2 state</th>
            <th className="th">ASG lifecycle</th>
            <th className="th">ASG health</th>
            <th className="th">ALB target health</th>
            <th className="th">AZ</th>
            <th className="th">Type</th>
            <th className="th">Launched (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.instanceId}>
              <td className="td mono sticky left-0 bg-panel">{r.instanceId}</td>
              <td className="td">
                {r.ec2State ? <StatusPill tone={ec2Tone(r.ec2State)}>{r.ec2State}</StatusPill> : <span className="text-muted">n/a</span>}
              </td>
              <td className="td">
                <StatusPill tone={lifecycleTone(r.asgLifecycle)}>{r.asgLifecycle}</StatusPill>
              </td>
              <td className="td">
                <StatusPill tone={r.asgHealth === "Healthy" ? "ok" : "bad"}>{r.asgHealth}</StatusPill>
              </td>
              <td className="td">
                {r.albTargetHealth ? (
                  <span className="flex items-center gap-2">
                    <StatusPill tone={TARGET_TONE[r.albTargetHealth]}>{r.albTargetHealth}</StatusPill>
                    {r.albTargetReason && <span className="mono text-[10.5px] text-muted">{r.albTargetReason}</span>}
                  </span>
                ) : (
                  <span className="text-muted" title="Not registered in the target group, or target health unavailable">
                    not registered
                  </span>
                )}
              </td>
              <td className="td mono">{r.availabilityZone ?? "—"}</td>
              <td className="td mono">{r.instanceType ?? "—"}</td>
              <td className="td mono">{fmtUtcDateTime(r.launchTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
