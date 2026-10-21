"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelError } from "@/types/api";

export type Phase = "loading" | "fresh" | "refreshing" | "stale" | "error";

interface Stored<T> {
  url: string;
  data: T;
  /** Wall-clock time of the last successful retrieval on this client. */
  okAt: number;
}

export interface LiveData<T> {
  data: T | null;
  phase: Phase;
  /** Errors from the most recent failed fetch (null after a success). */
  failure: PanelError[] | null;
  lastOkAt: number | null;
  refresh: () => void;
}

/**
 * Polls a same-origin endpoint while the tab is visible. Never overlaps requests, aborts on
 * unmount / URL change, and keeps the last good result visibly STALE when a refresh fails.
 */
export function useLiveData<T>(url: string, intervalMs = 30_000): LiveData<T> {
  const [stored, setStored] = useState<Stored<T> | null>(null);
  const [failure, setFailure] = useState<PanelError[] | null>(null);
  const [busy, setBusy] = useState(true);
  const inflight = useRef<AbortController | null>(null);
  const lastStart = useRef(0);
  const urlRef = useRef(url);

  const load = useCallback(async (force: boolean) => {
    if (inflight.current && !force) return; // suppress overlapping polls
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    const target = urlRef.current;
    lastStart.current = Date.now();
    setBusy(true);
    try {
      const res = await fetch(target, { signal: ctrl.signal, cache: "no-store" });
      if (res.status === 401) {
        // Full reload on purpose: clears client state when the session expires.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      if (ctrl.signal.aborted) return;
      if (res.status === 409) setStored(null);
      if (res.ok && body) {
        setStored({ url: target, data: body as T, okAt: Date.now() });
        setFailure(null);
      } else {
        const errs = (body as { errors?: PanelError[] } | null)?.errors;
        setFailure(
          errs?.length
            ? errs
            : [{ source: "autoscaling", code: "AWS_UNAVAILABLE", message: "The dashboard API returned an error." }],
        );
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setFailure([
        { source: "autoscaling", code: "AWS_UNAVAILABLE", message: "Could not reach the dashboard API." },
      ]);
    } finally {
      if (inflight.current === ctrl) {
        inflight.current = null;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    urlRef.current = url;
    const initial = setTimeout(() => { void load(true); }, 0);
    const tick = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    const timer = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastStart.current >= intervalMs) {
        void load(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      inflight.current?.abort();
      inflight.current = null;
    };
  }, [url, intervalMs, load]);

  // Data belonging to a previous URL (e.g. another time range) is never shown for this one.
  const current = stored && stored.url === url ? stored : null;
  let phase: Phase;
  if (!current) phase = failure && !busy ? "error" : "loading";
  else if (failure) phase = "stale";
  else phase = busy ? "refreshing" : "fresh";

  return {
    data: current?.data ?? null,
    phase,
    failure,
    lastOkAt: current?.okAt ?? null,
    refresh: () => void load(true),
  };
}
