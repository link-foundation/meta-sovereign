// Reduced visual effects (R-Z21): on a machine that renders slowly (a
// browser without a GPU, software compositing) the frosted-glass blur
// and the tutorial's page-sized dim can make every frame take seconds,
// so clicks never settle. A bounded frame-time probe measures it, and
// `<html data-effects="reduced">` then switches the blur, the page-wide
// dim and the non-essential animations off (app.css, same solid look as
// `prefers-reduced-transparency`).
//
// Setting "Reduce visual effects": auto (default: the probe decides),
// on or off, kept in localStorage like the theme (a UI preference, not
// store data). `?effects=reduced|full` in the URL overrides it for the
// visit, `prefers-reduced-transparency` / `prefers-reduced-motion`
// count as "on" in auto.

import { useEffect, useSyncExternalStore } from 'react';

export const EFFECTS_MODES = ['auto', 'on', 'off'];
export const EFFECTS_KEY = 'metaSovereignEffects';

const SAMPLES = 10;
const MIN_SAMPLES = 5;
const SLOW_FRAME_MS = 50;
const SLOW_FRAME_FEW_CORES_MS = 34;
const PROBE_BUDGET_MS = 4000;
const SETTLE_TIMEOUT_MS = 2000;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Gaps between consecutive frame timestamps. */
export const frameIntervals = (stamps) =>
  stamps.slice(1).map((stamp, index) => stamp - stamps[index]);

/**
 * Whether measured frame gaps (ms) mean "render less": the median above
 * 50 ms, or above ~34 ms (under 30 fps) on a machine with two cores or
 * fewer. Too few samples decide nothing.
 */
export const isSlowRendering = (intervals, { cores = 4 } = {}) => {
  if (!Array.isArray(intervals) || intervals.length < MIN_SAMPLES) {
    return false;
  }
  const typical = median(intervals);
  return (
    typical > SLOW_FRAME_MS || (cores <= 2 && typical > SLOW_FRAME_FEW_CORES_MS)
  );
};

/**
 * Samples up to `samples` animation frames, then stops (it never keeps a
 * loop running): resolves with the frame gaps, or with what it has when
 * the budget passes or the page is hidden (no frames are drawn then).
 */
export const probeFrames = ({
  raf = globalThis.requestAnimationFrame?.bind(globalThis),
  cancel = globalThis.cancelAnimationFrame?.bind(globalThis),
  samples = SAMPLES + 1,
  budgetMs = PROBE_BUDGET_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) =>
  new Promise((resolve) => {
    if (!raf) {
      resolve([]);
      return;
    }
    const stamps = [];
    let handle = 0;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        cancel?.(handle);
        clearTimer(timer);
        resolve(frameIntervals(stamps));
      }
    };
    const timer = setTimer(finish, budgetMs);
    const step = (stamp) => {
      stamps.push(stamp);
      if (stamps.length >= samples) {
        finish();
      } else {
        handle = raf(step);
      }
    };
    handle = raf(step);
  });

const read = (key) => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    // Storage can be disabled in restricted browser contexts.
    return null;
  }
};

const write = (key, value) => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // See read().
  }
};

let mode = null;
let measured = false;
const listeners = new Set();
const current = () => {
  if (mode === null) {
    const stored = read(EFFECTS_KEY);
    mode = EFFECTS_MODES.includes(stored) ? stored : 'auto';
  }
  return mode;
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const notify = () => listeners.forEach((listener) => listener());

export const setEffectsMode = (next) => {
  if (!EFFECTS_MODES.includes(next)) {
    return false;
  }
  mode = next;
  write(EFFECTS_KEY, next);
  notify();
  return true;
};

const matches = (query) => Boolean(globalThis.matchMedia?.(query)?.matches);

/** `reduced` or `full` from the choice, the URL, the OS and the probe. */
export const resolveEffects = ({
  choice = 'auto',
  query = '',
  slow = false,
  osReduced = false,
} = {}) => {
  const forced = new URLSearchParams(query).get('effects');
  if (forced === 'reduced' || forced === 'full') {
    return forced;
  }
  if (choice === 'on') {
    return 'reduced';
  }
  if (choice === 'off') {
    return 'full';
  }
  return slow || osReduced ? 'reduced' : 'full';
};

/**
 * True only when `needed` consecutive probe samples are all slow, so one
 * janky stretch (boot, a big list rendering) never decides. A fast, empty
 * (hidden page) or missing sample ends it at once; at most `needed`
 * samples are ever taken.
 */
export const detectSlowRendering = async ({
  sample = probeFrames,
  cores = 4,
  needed = 2,
} = {}) => {
  for (let taken = 0; taken < needed; taken += 1) {
    if (!isSlowRendering(await sample(), { cores })) {
      return false;
    }
  }
  return true;
};

/**
 * Resolves once the app has settled after startup: the page is loaded,
 * then the browser is idle (or `timeoutMs` passes).
 */
export const whenSettled = ({
  ready = () => globalThis.document?.readyState === 'complete',
  onLoad = (cb) => globalThis.addEventListener?.('load', cb, { once: true }),
  idle = globalThis.requestIdleCallback?.bind(globalThis),
  setTimer = globalThis.setTimeout,
  timeoutMs = SETTLE_TIMEOUT_MS,
} = {}) =>
  new Promise((resolve) => {
    const afterLoad = () =>
      idle
        ? idle(resolve, { timeout: timeoutMs })
        : setTimer(resolve, timeoutMs);
    if (ready()) {
      afterLoad();
    } else {
      onLoad(afterLoad);
      setTimer(resolve, timeoutMs);
    }
  });

// The decision lives in session memory only; just the user's explicit
// choice is stored.
let probing = false;
const probe = async (settle) => {
  if (measured || probing || current() !== 'auto') {
    return;
  }
  probing = true;
  try {
    if (settle) {
      await whenSettled();
    }
    if (
      current() === 'auto' &&
      (await detectSlowRendering({
        cores: globalThis.navigator?.hardwareConcurrency ?? 4,
      }))
    ) {
      measured = true;
      notify();
    }
  } finally {
    probing = false;
  }
};

const apply = (choice) => {
  const root = globalThis.document?.documentElement;
  if (root) {
    root.dataset.effects = resolveEffects({
      choice,
      query: globalThis.location?.search ?? '',
      slow: measured,
      osReduced:
        matches('(prefers-reduced-transparency: reduce)') ||
        matches('(prefers-reduced-motion: reduce)'),
    });
  }
};

/** `{ effects, setEffects }` for the Settings control. */
export const useEffectsSetting = () => ({
  effects: useSyncExternalStore(subscribe, current, current),
  setEffects: setEffectsMode,
});

/**
 * Keeps <html data-effects> in step with the choice and probes the frame
 * time once the app has settled and when the tutorial opens (two slow
 * samples in a row; a slow page is noticed once and stays reduced for
 * the visit, in memory only).
 */
export const useApplyEffects = (tutorialOpen = false) => {
  const choice = useSyncExternalStore(subscribe, current, current);
  useEffect(() => {
    apply(choice);
    return subscribe(() => apply(current()));
  }, [choice]);
  useEffect(() => {
    // Startup waits for the app to settle; opening the tutorial probes now.
    probe(!tutorialOpen);
  }, [choice, tutorialOpen]);
};
