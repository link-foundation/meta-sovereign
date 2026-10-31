// Native media requests can remain pending without an error. Detect inactivity
// without downloading a second copy.
export const MEDIA_LOAD_EVENT = 'meta-sovereign:media-load';
export const MEDIA_STALL_MS = 15_000;

const kindOf = (node) => String(node?.tagName ?? '').toLowerCase();
export const decodedMedia = (node) =>
  kindOf(node) === 'img'
    ? node.complete && node.naturalWidth > 0
    : Number(node?.readyState) >= (node?.paused ? 2 : 3);

export const mediaLoadTrace = (
  node,
  phase,
  durationMs,
  target = globalThis.window
) => {
  if (!target?.dispatchEvent || typeof globalThis.CustomEvent !== 'function') {
    return;
  }
  const path = String(node?.currentSrc || node?.src || '');
  const route =
    /\/api\/telegram\/(avatar|media|file)\b/.exec(path)?.[1] ?? 'other';
  target.dispatchEvent(
    new globalThis.CustomEvent(MEDIA_LOAD_EVENT, {
      detail: {
        phase,
        kind: kindOf(node),
        route,
        durationMs: Math.round(durationMs),
      },
    })
  );
};

/** Renew on real progress, reconcile cached decodes and release stalled images. */
export const watchMediaElement = (
  node,
  { ready, stalled },
  {
    clock = globalThis,
    stallMs = MEDIA_STALL_MS,
    document = globalThis.document,
  } = {}
) => {
  let timer = null;
  let stopped = false;
  const check = () => {
    if (stopped) {
      return;
    }
    if (decodedMedia(node)) {
      ready();
      return;
    }
    // A lazy image or background tab may intentionally not be requesting bytes.
    if (
      document?.visibilityState === 'hidden' ||
      (node.loading === 'lazy' && !node.currentSrc)
    ) {
      renew();
      return;
    }
    stalled();
    if (kindOf(node) === 'img') {
      node.removeAttribute?.('src');
    }
  };
  const renew = () => {
    clock.clearTimeout(timer);
    if (!stopped) {
      timer = clock.setTimeout(check, stallMs);
    }
  };
  const progress = () => (decodedMedia(node) ? ready() : renew());
  const events = ['load', 'loadeddata', 'canplay', 'playing', 'progress'];
  events.forEach((name) => node.addEventListener?.(name, progress));
  if (decodedMedia(node)) {
    ready();
  } else {
    renew();
  }
  return () => {
    stopped = true;
    clock.clearTimeout(timer);
    events.forEach((name) => node.removeEventListener?.(name, progress));
  };
};
