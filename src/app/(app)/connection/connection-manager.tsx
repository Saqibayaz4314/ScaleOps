"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Panel, StatusPill } from "@/components/ui/primitives";
import { fmtUtcDateTime } from "@/lib/utils/format";
import type { ConnectionMeta } from "@/lib/db/connections";
import type { PanelError } from "@/types/api";

interface Group {
  name: string;
  min: number;
  max: number;
  desired: number;
  instanceCount: number;
  targetGroups: { arn: string; name: string; albArns: string[] }[];
}
interface Check {
  name: string;
  ok: boolean;
  error: PanelError | null;
}

const POLICY = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Resource": "*",
    "Action": [
      "autoscaling:DescribeAutoScalingGroups",
      "autoscaling:DescribeScalingActivities",
      "ec2:DescribeInstances",
      "elasticloadbalancing:DescribeTargetHealth",
      "elasticloadbalancing:DescribeTargetGroups",
      "cloudwatch:GetMetricData"
    ]
  }]
}`;

async function api<T>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { message?: string } }> {
  try {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { message: "Could not reach the server. Please retry." } as T & { message?: string } };
  }
}

function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-[4px] border border-critical/40 bg-[#fbeeed] px-3 py-2.5 text-[12.5px]">
      {message}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
const inputCls = "mono min-h-11 w-full rounded-[4px] border border-hairline bg-panel px-3 text-[13px]";
const btn = "min-h-10 rounded-[4px] px-4 text-[13px] font-semibold disabled:opacity-50";

function Checks({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y divide-hairline rounded-[4px] border border-hairline">
      {checks.map((c) => (
        <li key={c.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
          <span>{c.name}</span>
          <span className="flex items-center gap-2">
            {c.error && <span className="text-[11.5px] text-muted">{c.error.message}</span>}
            <StatusPill tone={c.ok ? "ok" : "bad"}>{c.ok ? "ok" : "failed"}</StatusPill>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ConnectionManager({ initial }: { initial: ConnectionMeta | null }) {
  const router = useRouter();
  const [meta, setMeta] = useState(initial);
  const [editing, setEditing] = useState(initial === null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);

  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [region, setRegion] = useState(initial?.region ?? "ap-south-1");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [asgName, setAsgName] = useState("");
  const [tgArn, setTgArn] = useState("");
  const [albArn, setAlbArn] = useState("");
  const [manual, setManual] = useState(false);

  const group = groups?.find((g) => g.name === asgName);

  function pickGroup(name: string) {
    setAsgName(name);
    const g = groups?.find((x) => x.name === name);
    const tg = g?.targetGroups[0];
    setTgArn(tg?.arn ?? "");
    setAlbArn(tg?.albArns[0] ?? "");
  }
  function pickTargetGroup(arn: string) {
    setTgArn(arn);
    setAlbArn(group?.targetGroups.find((t) => t.arn === arn)?.albArns[0] ?? "");
  }

  async function discover(e: React.FormEvent) {
    e.preventDefault();
    setBusy("discover");
    setError(null);
    setChecks(null);
    const r = await api<{ groups: Group[] }>("/api/connection/discover", "POST", { accessKeyId, secretAccessKey, region });
    setBusy(null);
    if (!r.ok) {
      setError(r.data.message ?? "Could not list Auto Scaling groups.");
      return;
    }
    setGroups(r.data.groups);
    const first = r.data.groups[0];
    // React has not committed setGroups yet; use the fetched response directly.
    const target = first?.targetGroups[0];
    setAsgName(first?.name ?? "");
    setTgArn(target?.arn ?? "");
    setAlbArn(target?.albArns[0] ?? "");
    setManual(!target || target.albArns.length === 0);
  }

  async function connect() {
    setBusy("connect");
    setError(null);
    const r = await api<{ checks?: Check[] }>("/api/connection", "PUT", {
      accessKeyId,
      secretAccessKey,
      region,
      asgName,
      albArn,
      targetGroupArn: tgArn,
    });
    setBusy(null);
    setChecks(r.data.checks ?? null);
    if (!r.ok) {
      setError(r.data.message ?? "Could not connect.");
      return;
    }
    setSecretAccessKey("");
    setAccessKeyId("");
    router.replace("/dashboard");
    router.refresh();
  }

  async function verify() {
    setBusy("verify");
    setError(null);
    const r = await api<{ checks?: Check[] }>("/api/connection/verify", "POST");
    setBusy(null);
    if (!r.ok) setError(r.data.message ?? "Verification failed.");
    setChecks(r.data.checks ?? null);
    const m = await api<{ connection: ConnectionMeta | null }>("/api/connection", "GET");
    if (m.ok) setMeta(m.data.connection);
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this AWS account? Stored credentials will be deleted.")) return;
    setBusy("disconnect");
    const r = await api("/api/connection", "DELETE");
    setBusy(null);
    if (r.ok) {
      setMeta(null);
      setEditing(true);
      setChecks(null);
      router.refresh();
    } else setError("Could not disconnect.");
  }

  const ready = Boolean(asgName && tgArn && albArn && accessKeyId && secretAccessKey);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-4">
        {meta && !editing && (
          <Panel title="Connected account" eyebrow="Status" footnote="Credentials are stored AES-256-GCM encrypted and are never returned to the browser.">
            <dl className="divide-y divide-hairline">
              {[
                ["AWS account", meta.awsAccountId ?? "—"],
                ["IAM principal", meta.principalArn ?? "—"],
                ["Access key", `AKIA…${meta.keyHint}`],
                ["Region", meta.region],
                ["Auto Scaling group", meta.asgName],
                ["Last verified", fmtUtcDateTime(meta.lastVerifiedAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap items-baseline justify-between gap-4 py-2">
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mono break-all text-[12.5px]">{v}</dd>
                </div>
              ))}
            </dl>
            {meta.lastError && <p className="mt-3 text-[12.5px] text-critical">Last check: {meta.lastError}</p>}
            {checks && <div className="mt-4"><Checks checks={checks} /></div>}
            {error && <div className="mt-3"><FormError message={error} /></div>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={verify} disabled={busy !== null} className={`${btn} bg-ink text-white hover:bg-ink-2`}>
                {busy === "verify" ? "Verifying…" : "Re-verify"}
              </button>
              <button type="button" onClick={() => setEditing(true)} className={`${btn} border border-hairline hover:border-ink`}>
                Replace credentials
              </button>
              <button type="button" onClick={disconnect} disabled={busy !== null} className={`${btn} border border-critical/50 text-critical hover:bg-[#fbeeed]`}>
                Disconnect
              </button>
            </div>
          </Panel>
        )}

        {editing && (
          <Panel title={meta ? "Replace credentials" : "Connect AWS account"} eyebrow="Read-only access keys" footnote="Finding groups does not save a connection. Select the deployment, then click Verify and connect once. After saving, all pages automatically reuse it.">
            <form onSubmit={discover} className="space-y-4" autoComplete="off">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Access key ID">
                  <input className={inputCls} value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder="AKIA…" spellCheck={false} required />
                </Field>
                <Field label="Region">
                  <input className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="ap-south-1" spellCheck={false} required />
                </Field>
              </div>
              <Field label="Secret access key">
                <input className={inputCls} type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} autoComplete="new-password" spellCheck={false} required />
              </Field>
              <button type="submit" disabled={busy !== null || !accessKeyId || !secretAccessKey} className={`${btn} bg-ink text-white hover:bg-ink-2`}>
                {busy === "discover" ? "Looking up…" : "Find Auto Scaling groups"}
              </button>
            </form>

            {error && <div className="mt-4"><FormError message={error} /></div>}

            {groups && (
              <div className="mt-5 space-y-4 border-t border-hairline pt-5">
                {groups.length > 0 && (
                  <>
                    <Field label="Auto Scaling group">
                      <select className={inputCls} value={asgName} onChange={(e) => pickGroup(e.target.value)}>
                        {groups.map((g) => (
                          <option key={g.name} value={g.name}>
                            {g.name} — {g.instanceCount} instance(s), min {g.min} / max {g.max}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {group && group.targetGroups.length > 1 && (
                      <Field label="Target group">
                        <select className={inputCls} value={tgArn} onChange={(e) => pickTargetGroup(e.target.value)}>
                          {group.targetGroups.map((t) => <option key={t.arn} value={t.arn}>{t.name}</option>)}
                        </select>
                      </Field>
                    )}
                    {group && group.targetGroups.length === 0 && (
                      <p className="text-[12.5px] text-muted">This group has no ALB target group attached. Enter ARNs manually below.</p>
                    )}
                  </>
                )}
                <button type="button" onClick={() => setManual((m) => !m)} className="text-[12px] font-medium text-cobalt hover:underline">
                  {manual ? "Hide manual ARN entry" : "Enter ARNs manually"}
                </button>
                {manual && (
                  <div className="space-y-4">
                    {groups.length === 0 && (
                      <Field label="Auto Scaling group name">
                        <input className={inputCls} value={asgName} onChange={(e) => setAsgName(e.target.value)} />
                      </Field>
                    )}
                    <Field label="Target group ARN"><input className={inputCls} value={tgArn} onChange={(e) => setTgArn(e.target.value)} spellCheck={false} /></Field>
                    <Field label="Load balancer ARN"><input className={inputCls} value={albArn} onChange={(e) => setAlbArn(e.target.value)} spellCheck={false} /></Field>
                  </div>
                )}
                {checks && <Checks checks={checks} />}
                <div className="flex gap-2">
                  <button type="button" onClick={connect} disabled={busy !== null || !ready} className={`${btn} bg-cobalt text-white hover:opacity-90`}>
                    {busy === "connect" ? "Verifying & saving…" : "Verify and connect"}
                  </button>
                  {meta && (
                    <button type="button" onClick={() => { setEditing(false); setError(null); }} className={`${btn} border border-hairline`}>Cancel</button>
                  )}
                </div>
              </div>
            )}
          </Panel>
        )}
      </div>

      <Panel title="Create the read-only IAM user" eyebrow="Before you connect" footnote="Use a dedicated IAM user with only this policy. Never use root or administrator keys; root keys are rejected.">
        <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] leading-snug">
          <li>In IAM, create a user with no console access.</li>
          <li>Attach an inline policy with the JSON below.</li>
          <li>Create an access key (&ldquo;Application running outside AWS&rdquo;) and paste it here.</li>
        </ol>
        <pre className="mono mt-3 max-h-72 overflow-auto rounded-[4px] border border-hairline bg-chalk/50 p-3 text-[11px] leading-snug">{POLICY}</pre>
        <p className="mt-3 text-[12px] text-muted">
          ScaleOps only calls the read actions above. AWS cannot be told to enforce that for keys you hand us, so
          the policy you attach is what actually guarantees read-only access.
        </p>
      </Panel>
    </div>
  );
}
