import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { appNavigation } from './app-route.js';

// Wait for async section content to be tall enough before restoring its scroll.
// User input cancels restoration so it cannot pull the page away afterwards.
const restoreScroll = (scroll, done) => {
  const [x, y] = scroll ?? [0, 0];
  let frame;
  let stopped = false;
  const end = () => {
    stopped = true;
    globalThis.cancelAnimationFrame(frame);
    done();
  };
  const until = Date.now() + 5000;
  const apply = () => {
    const height = globalThis.document.scrollingElement?.scrollHeight ?? 0;
    if (height - globalThis.innerHeight >= y || Date.now() >= until) {
      globalThis.scrollTo?.(x, y);
      end();
    } else if (!stopped) {
      frame = globalThis.requestAnimationFrame(apply);
    }
  };
  const events = ['wheel', 'pointerdown', 'touchstart', 'keydown'];
  events.forEach((event) =>
    globalThis.addEventListener(event, end, { passive: true, once: true })
  );
  apply();
  return () => {
    end();
    events.forEach((event) => globalThis.removeEventListener(event, end));
  };
};

export const useAppNavigation = () => {
  const navigation = appNavigation();
  const route = useSyncExternalStore(
    navigation.subscribe,
    navigation.snapshot,
    navigation.snapshot
  );
  useLayoutEffect(() => navigation.start(), [navigation]);
  useEffect(() => {
    const onNavigate = (event) => navigation.go(event.detail ?? {});
    globalThis.addEventListener('meta-sovereign:navigate', onNavigate);
    return () =>
      globalThis.removeEventListener('meta-sovereign:navigate', onNavigate);
  }, [navigation]);
  useLayoutEffect(() => {
    const previous = globalThis.history.scrollRestoration;
    globalThis.history.scrollRestoration = 'manual';
    navigation.restoring(true);
    const stop = restoreScroll(route.scroll, () => navigation.restoring(false));
    return () => {
      stop();
      globalThis.history.scrollRestoration = previous;
    };
  }, [route, navigation]);
  return [route, navigation.go];
};
