/**
 * Server autodiscovery for the SPA.
 *
 * The directive: "All apps must use WebRTC + WebSockets to connect to
 * the local links server (it can be in localhost or in local network,
 * we need to make sure we have a way to autodetect it, and configure
 * manually if everything failed)."
 *
 * Strategy, tried in order until one returns a healthy `/api/status`:
 *   1. Same origin (when the SPA was *served* by the server itself —
 *      e.g. http://localhost:8787/. This is the GitHub Pages and
 *      "open the bundled index.html in a browser" case if a server
 *      happens to be reachable on the same origin).
 *   2. A previously-saved override stored under `metaServer` in the
 *      injected `storage` (localStorage in the browser).
 *   3. A short list of common local ports on 127.0.0.1.
 *   4. A list of LAN candidates if the page knows them (passed in).
 *
 * Returns `{ origin: string }` for the first reachable server, or
 * `null` when none answered. Callers use `null` to mean "go fully
 * offline, only the local browser store is available".
 *
 * The function takes `{ fetchImpl, storage, candidates, signal }` so
 * it is fully unit-testable in plain Node (no DOM globals required).
 */

const HEALTH = '/api/status';
const STORAGE_KEY = 'metaServer';
const DEFAULT_PORTS = [8787, 8788, 7001, 7002, 3000];

const probe = async (origin, fetchImpl, signal) => {
  try {
    const res = await fetchImpl(`${origin}${HEALTH}`, { signal });
    if (!res.ok) {
      return false;
    }
    const json = await res.json();
    // Loose duck-type check: we accept anything that looks like the
    // status payload (an object with a numeric counter).
    return json && typeof json === 'object';
  } catch {
    return false;
  }
};

const readSavedOverride = (storage) => {
  try {
    return storage?.getItem?.(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
};

const buildCandidateList = (origin, storage, candidates) => {
  const list = [];
  if (origin && /^https?:/.test(origin)) {
    list.push(origin);
  }
  const saved = readSavedOverride(storage);
  if (saved) {
    list.push(saved);
  }
  for (const port of DEFAULT_PORTS) {
    list.push(`http://127.0.0.1:${port}`);
  }
  for (const c of candidates) {
    list.push(c);
  }
  return list;
};

export const discoverServer = async ({
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  origin = globalThis.location?.origin,
  candidates = [],
  signal,
} = {}) => {
  const seen = new Set();
  const list = buildCandidateList(origin, storage, candidates);
  for (const candidate of list) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    if (await probe(candidate, fetchImpl, signal)) {
      return { origin: candidate };
    }
  }
  return null;
};

export const saveServerOverride = (
  origin,
  storage = globalThis.localStorage
) => {
  try {
    storage.setItem(STORAGE_KEY, origin);
  } catch {
    // ignore — not all environments allow writes (private mode)
  }
};

export const clearServerOverride = (storage = globalThis.localStorage) => {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
