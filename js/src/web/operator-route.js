import { appNavigation, operatorHash } from './app-route.js';
import { debugBrowser } from './client-log.js';

// A verified card may finish rendering after a browser history transition.
export const syncOperatorRoute = (
  current,
  queue,
  navigation = appNavigation()
) => {
  const route = navigation.snapshot();
  if (!current || route.view !== 'operator') {
    return;
  }
  const requested = route.chat
    ? `${route.chat.source}:${route.chat.chat}`
    : null;
  if (
    requested &&
    requested !== current.key &&
    queue.some((chat) => chat.key === requested)
  ) {
    debugBrowser('operator-route-pending', {
      current: current.key,
      requested,
    });
    return;
  }
  debugBrowser('operator-route', {
    current: current.key,
    route: route.anchor,
    hash: globalThis.location?.hash,
  });
  navigation.go(
    { view: 'operator', anchor: operatorHash(current.key) },
    { replace: true }
  );
};
