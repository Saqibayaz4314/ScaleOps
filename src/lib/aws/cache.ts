import "server-only";

// Best-effort, per-instance TTL cache with in-flight de-duplication. Serverless instances do
// not share memory, so this only collapses bursts of concurrent viewers on one warm instance.
// Cached values are non-secret AWS read results, and callers are authenticated before use.
interface Entry<T> {
  expires: number;
  value?: T;
  inflight?: Promise<T>;
}
const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit?.value !== undefined && hit.expires > now) return hit.value;
  if (hit?.inflight) return hit.inflight;

  const inflight = load().then(
    (value) => {
      store.set(key, { expires: Date.now() + ttlMs, value });
      return value;
    },
    (err) => {
      store.delete(key); // never cache failures
      throw err;
    },
  );
  store.set(key, { expires: 0, inflight });
  if (store.size > 100) store.clear();
  return inflight;
}
