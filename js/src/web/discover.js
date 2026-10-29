import { getLocalStorage } from '../storage/local-storage.js';

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
 *   3. Runtime shell candidates injected by Electron/Capacitor WebViews.
 *   4. A short list of common local ports on 127.0.0.1 — over https
 *      too from an https page: Safari blocks http://127.0.0.1 there but
 *      reaches a server whose certificate it trusts (R-Y64).
 *   5. A list of LAN candidates if the page knows them (passed in).
 *
 * Returns `{ origin: string }` for the first reachable server, or
 * `null` when none answered. Callers use `null` to mean "go fully
 * offline, only the local browser store is available".
 *
 * The function takes `{ fetchImpl, storage, candidates, signal }` so
 * it is fully unit-testable in plain Node (no DOM globals required).
 */

// Older servers ignore the query and return their usual status. Updated
// servers identify themselves without scanning/verifying message history.
export const DISCOVERY_PATH = '/api/status?probe=1';
const STORAGE_KEY = 'metaServer';
// The ports a server is looked for on, ours (8787) first; `serve`
// warns when it listens on another one (R-Y58).
export const DEFAULT_PORTS = Object.freeze([8787, 8788, 7001, 7002, 3000]);
// Safari keeps an https page from asking http://127.0.0.1 anything but
// still shows it pictures from there: the server's picture is this
// wide, one pixel high when it serves its own copy of the app, two when
// that copy is off, two more when it answers https as well
// (../server/hosted-ui.js).
export const BEACON_PATH = '/api/beacon.svg';
export const BEACON_WIDTH = 23;

const candidateArray = (value) => {
  if (!value) {
    return [];
  }
  const raw = Array.isArray(value) ? value : String(value).split(/[,\s]+/);
  return raw
    .map((candidate) => String(candidate).trim())
    .filter((candidate) => /^https?:\/\//.test(candidate));
};

const runtimeCandidates = () => {
  const shell = globalThis.metaSovereignShell ?? {};
  return [
    ...candidateArray(shell.serverOrigin),
    ...candidateArray(shell.discoveryCandidates),
    ...candidateArray(globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES),
  ];
};

const identifiesServer = (json) =>
  json?.service === 'meta-sovereign' &&
  (json.discovery === true ||
    (Number.isSafeInteger(json.links) && json.links >= 0));

const probe = async (origin, fetchImpl, signal, timeout) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = globalThis.setTimeout(abort, timeout);
  try {
    if (signal?.aborted) {
      return false;
    }
    const res = await fetchImpl(`${origin}${DISCOVERY_PATH}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    // A server locked by its passcode (R-Y183) is still the server: the
    // page shows its unlock screen.
    if (
      res.status === 423 &&
      json?.service === 'meta-sovereign' &&
      json?.code === 'locked'
    ) {
      return true;
    }
    if (!res.ok) {
      return false;
    }
    // Do not attach to an unrelated JSON service on a common local port.
    // HTTPS authenticates the server; this identifies its wire protocol.
    return identifiesServer(json);
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
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
  for (const c of runtimeCandidates()) {
    list.push(c);
  }
  const secure = String(origin ?? '').startsWith('https:');
  for (const port of DEFAULT_PORTS) {
    if (secure) {
      list.push(`https://127.0.0.1:${port}`);
    }
    list.push(`http://127.0.0.1:${port}`);
  }
  for (const c of candidates) {
    list.push(c);
  }
  return list;
};

export const discoverServer = async ({
  fetchImpl = globalThis.fetch,
  storage = getLocalStorage(),
  origin = globalThis.location?.origin,
  candidates = [],
  signal,
  probeTimeoutMs,
} = {}) => {
  const seen = new Set();
  const list = buildCandidateList(origin, storage, candidates);
  for (const candidate of list) {
    if (signal?.aborted) {
      return null;
    }
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    // A large archive can briefly block even the tiny probe during startup.
    // Give our primary loopback server room to answer; other ports stay quick.
    const primary = ['https:', 'http:'].some(
      (scheme) => candidate === `${scheme}//127.0.0.1:${DEFAULT_PORTS[0]}`
    );
    const timeout = probeTimeoutMs ?? (primary ? 15_000 : 1500);
    if (await probe(candidate, fetchImpl, signal, timeout)) {
      return { origin: candidate };
    }
  }
  return null;
};

export const saveServerOverride = (origin, storage = getLocalStorage()) => {
  try {
    storage.setItem(STORAGE_KEY, origin);
  } catch {
    // ignore — not all environments allow writes (private mode)
  }
};

export const clearServerOverride = (storage = getLocalStorage()) => {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

// The size of the picture at `src`, or null when none loads in time.
const pictureSize = (src, timeout) =>
  new Promise((resolve) => {
    const img = new globalThis.Image();
    const done = (size) => {
      globalThis.clearTimeout(timer);
      img.onload = img.onerror = null;
      resolve(size);
    };
    const timer = globalThis.setTimeout(() => done(null), timeout);
    img.onload = () =>
      done({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => done(null);
    img.src = src;
  });

/** What the picture's height says: its own copy on, https on. */
export const pictureSays = (height) => ({
  localUi: height % 2 === 1,
  tls: height > 2,
});

/**
 * A server on this machine that the page cannot ask anything (Safari on
 * an https page), found by its picture on our ports: `{ origin, localUi,
 * tls }` for the first one, or null.
 */
export const findServerByPicture = async ({
  ports = DEFAULT_PORTS,
  sizeOf = pictureSize,
  // A busy server can be slow to answer; the picture is tiny.
  timeout = 10_000,
  now = Date.now,
} = {}) => {
  const seen = await Promise.all(
    ports.map(async (port) => {
      const origin = `http://127.0.0.1:${port}`;
      const size = await sizeOf(`${origin}${BEACON_PATH}?${now()}`, timeout);
      return size?.width === BEACON_WIDTH
        ? { origin, ...pictureSays(size.height) }
        : null;
    })
  );
  return seen.find(Boolean) ?? null;
};

/**
 * Whether a page here may be blocked from a server it can see: an
 * https page in a plain browser (not the desktop or mobile shell).
 */
export const mayNeedPicture = ({
  location = globalThis.location,
  shell = globalThis.metaSovereignShell,
  capacitor = globalThis.Capacitor,
  hasImage = typeof globalThis.Image === 'function',
} = {}) =>
  hasImage &&
  location?.protocol === 'https:' &&
  !capacitor &&
  !['electron', 'capacitor'].includes(shell?.platform);
