const pad = (n: number) => String(n).padStart(2, "0");

export function fmtUtcTime(iso: string | null, withSeconds = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const base = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getUTCSeconds())} UTC` : `${base} UTC`;
}

export function fmtUtcDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function fmtUtcDateTime(iso: string | null): string {
  if (!iso) return "—";
  return `${fmtUtcDate(iso)} ${fmtUtcTime(iso)}`;
}

export function fmtNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function ageSeconds(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((now - t) / 1000));
}

export function fmtAge(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 90) return `${seconds}s ago`;
  const m = Math.round(seconds / 60);
  if (m < 120) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}
