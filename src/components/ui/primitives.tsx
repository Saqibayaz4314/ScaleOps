import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import type { PanelError } from "@/types/api";

export function Panel({
  title,
  eyebrow,
  actions,
  footnote,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`} aria-label={title}>
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        </div>
        {actions}
      </header>
      <div className="min-w-0 flex-1 p-4">{children}</div>
      {footnote && (
        <footer className="border-t border-hairline px-4 py-2 text-[11px] leading-snug text-muted">
          {footnote}
        </footer>
      )}
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function PanelSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2" style={{ height }}>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-full w-full" />
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex min-h-[140px] flex-col items-start justify-center gap-1 text-[13px]">
      <div className="font-medium">{title}</div>
      {detail && <div className="max-w-prose text-muted">{detail}</div>}
    </div>
  );
}

const ERROR_LABEL: Record<PanelError["code"], string> = {
  NOT_CONNECTED: "Not connected",
  NOT_CONFIGURED: "Not configured",
  AWS_ACCESS_DENIED: "Permission denied",
  AWS_RESOURCE_MISSING: "Resource not found",
  AWS_THROTTLED: "Throttled",
  AWS_TIMEOUT: "Timed out",
  AWS_UNAVAILABLE: "Unavailable",
  NO_DATAPOINTS: "No datapoints",
};

const SOURCE_LABEL: Record<PanelError["source"], string> = {
  autoscaling: "EC2 Auto Scaling",
  ec2: "EC2",
  elbv2: "Load Balancing",
  cloudwatch: "CloudWatch",
};

export function ErrorNotice({
  errors,
  title,
  tone = "error",
}: {
  errors: PanelError[];
  title?: string;
  tone?: "error" | "info";
}) {
  // Several AWS calls often fail for the same reason; show each distinct failure once.
  const seen = new Set<string>();
  errors = errors.filter((e) => {
    const k = `${e.source}:${e.code}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (errors.length === 0) return null;
  const needsConnection = errors.some((error) => error.code === "NOT_CONNECTED");
  if (needsConnection) {
    title = "Connect your AWS account once";
    tone = "info";
  }
  const Icon = tone === "error" ? AlertTriangle : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-3 rounded-[4px] border px-3 py-2.5 text-[12.5px] ${
        tone === "error"
          ? "border-critical/40 bg-[#fbeeed]"
          : "border-hairline bg-chalk/60"
      }`}
    >
      <Icon
        size={16}
        className={`mt-0.5 shrink-0 ${tone === "error" ? "text-critical" : "text-muted"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-1">
        {title && <div className="font-semibold">{title}</div>}
        <ul className="space-y-0.5">
          {errors.map((e, i) => (
            <li key={`${e.source}-${e.code}-${i}`}>
              <span className="mono text-[11px] uppercase tracking-wide text-muted">
                {SOURCE_LABEL[e.source]} · {ERROR_LABEL[e.code]}
              </span>
              <span className="block">{e.message}</span>
            </li>
          ))}
        </ul>
        {needsConnection && <Link href="/connection" className="inline-block pt-2 font-semibold text-cobalt hover:underline">Connect AWS account →</Link>}
      </div>
    </div>
  );
}

type Tone = "ok" | "warn" | "bad" | "neutral" | "info";
const TONES: Record<Tone, string> = {
  ok: "text-success border-success/50 bg-[#eef5f1]",
  warn: "text-[#9a4128] border-copper/60 bg-[#fbf0ec]",
  bad: "text-critical border-critical/50 bg-[#fbeeed]",
  neutral: "text-muted border-hairline bg-chalk/50",
  info: "text-cobalt border-cobalt/40 bg-[#eef1fb]",
};

export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`mono inline-block rounded-[3px] border px-1.5 py-[1px] text-[10.5px] font-medium uppercase tracking-wide ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
