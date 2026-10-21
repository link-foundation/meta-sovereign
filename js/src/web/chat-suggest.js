// What the composer reads while the user types (R-Y70, R-Y71): its own
// text — a keystroke re-renders the box and its suggestions, not the
// whole chat screen — and the suggestions for that text, from the
// browser's copy of the reply index at once, with what the server adds
// a moment later.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { mergeSuggestions } from '../replies/reply-cache.js';

const NONE = { stage: 'none', suggestions: [] };
const NO_SUBSCRIBE = () => () => {};
// The server is asked once typing pauses this long (the copy answered).
const REFINE_MS = 250;

/** The composer's text, re-read on every change it announces. */
export const useComposerText = (composer) => {
  const read = () => String(composer?.text ?? '');
  return useSyncExternalStore(composer?.subscribe ?? NO_SUBSCRIBE, read, read);
};

/**
 * Suggestions for `text`. Without a `suggester` (a screen given its
 * state, as the tests do) `fallback` is shown as it is.
 */
export const useSuggestionsFor = (suggester, text, fallback = NONE) => {
  const local = useMemo(
    () => suggester?.local(text) ?? null,
    [suggester, text]
  );
  const [remote, setRemote] = useState(null);
  const loaded = local !== null;
  useEffect(() => {
    // Nothing typed: the copy's typical replies are all there is.
    if (!suggester || (loaded && !text.trim())) {
      return undefined;
    }
    let live = true;
    const timer = globalThis.setTimeout(
      () =>
        Promise.resolve(suggester.remote(text)).then(
          (result) =>
            live && result && setRemote({ key: suggester.key, text, result }),
          () => {}
        ),
      loaded ? REFINE_MS : 0
    );
    return () => {
      live = false;
      globalThis.clearTimeout(timer);
    };
  }, [suggester?.key, text, loaded]);
  if (!suggester) {
    return fallback ?? NONE;
  }
  const same = remote?.key === suggester.key;
  if (!loaded) {
    // Before the copy is loaded the server's answer shows, the last one
    // until the next arrives.
    return same ? remote.result : NONE;
  }
  return mergeSuggestions(
    local,
    same && remote.text === text ? remote.result : null
  );
};
