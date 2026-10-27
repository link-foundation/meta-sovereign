// Section routes coexist with the original chat and provider deep links.
import { navItems } from './nav-items.js';

export const APP_ROUTE_KEY = 'metaSovereignNavigation';
const VIEWS = new Set(navItems.map(([view]) => view));

export const splitChatAddress = (key) => {
  const match = /^([a-z0-9_-]+):(.+)$/i.exec(String(key ?? ''));
  return match ? { source: match[1], chat: match[2] } : null;
};

export const parseAppRoute = (hash = '') => {
  const anchor = String(hash);
  if (/^#conn-[a-z0-9-]+(?:\/manual)?$/i.test(anchor)) {
    return { view: 'connections', anchor };
  }
  if (anchor.startsWith('#chat=')) {
    try {
      const chat = splitChatAddress(decodeURIComponent(anchor.slice(6)));
      return chat ? { view: 'chat', anchor, chat } : null;
    } catch {
      return null;
    }
  }
  const match = /^#\/?([a-z][a-z0-9-]*)(?:\?(.*))?$/.exec(anchor);
  if (!match || !VIEWS.has(match[1])) {
    return null;
  }
  const view = match[1];
  const chat = splitChatAddress(new URLSearchParams(match[2]).get('chat'));
  return { view, anchor, ...(chat ? { chat } : {}) };
};

export const sectionHash = (view) => `#/${view}`;
export const operatorHash = (key) =>
  key ? `#/operator?chat=${encodeURIComponent(key)}` : sectionHash('operator');
export const chatHash = ({ source, chat }) =>
  `#chat=${source}:${encodeURIComponent(chat)}`;

const remembered = (env) => {
  try {
    const value = JSON.parse(
      env.sessionStorage?.getItem(APP_ROUTE_KEY) ?? 'null'
    );
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

const targetFor = (view, anchor, hashes) => {
  const wanted = anchor === undefined ? hashes[view] : anchor;
  const next = parseAppRoute(wanted);
  return next?.view === view ? next : { view, anchor: sectionHash(view) };
};

const visit = (target, before, replace) => ({
  ...target,
  previous: replace ? before.previous : before.anchor,
  scroll: replace && before.view === target.view ? before.scroll : [0, 0],
});

/** Browser history is the authority; session storage only remembers sections. */
export const createAppNavigation = (env = globalThis) => {
  const memory = remembered(env);
  const hashes = { ...memory.hashes };
  const initial = parseAppRoute(env.location?.hash) ??
    parseAppRoute(hashes[memory.view]) ?? { view: 'chat', anchor: '#/chat' };
  let route = {
    ...initial,
    previous: env.history?.state?.[APP_ROUTE_KEY]?.previous,
    scroll: env.history?.state?.[APP_ROUTE_KEY]?.scroll ?? [0, 0],
  };
  let url = env.location?.hash;
  let restoring = false;
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const remember = () => {
    hashes[route.view] = route.anchor;
    try {
      env.sessionStorage?.setItem(
        APP_ROUTE_KEY,
        JSON.stringify({ view: route.view, hashes })
      );
    } catch {
      // The URL and history still work with browser storage disabled.
    }
  };
  const write = (next, replace) => {
    const state = {
      ...env.history?.state,
      [APP_ROUTE_KEY]: { ...next, scroll: next.scroll },
    };
    env.history?.[replace ? 'replaceState' : 'pushState']?.(
      state,
      '',
      `${env.location?.pathname ?? ''}${env.location?.search ?? ''}${next.anchor}`
    );
    url = env.location?.hash;
  };
  const saveScroll = () => {
    if (restoring) {
      return;
    }
    env.history?.replaceState?.(
      {
        ...env.history.state,
        [APP_ROUTE_KEY]: {
          ...route,
          scroll: [env.scrollX ?? 0, env.scrollY ?? 0],
        },
      },
      '',
      env.location?.href
    );
  };
  const accept = () => {
    if (env.location?.hash === url) {
      return;
    }
    const next = parseAppRoute(env.location?.hash);
    url = env.location?.hash;
    if (!next) {
      return; // In-page anchors such as #root do not switch sections.
    }
    const kept = env.history?.state?.[APP_ROUTE_KEY];
    route = {
      ...next,
      previous: kept?.anchor === next.anchor ? kept.previous : route.anchor,
      scroll: kept?.anchor === next.anchor ? kept.scroll : [0, 0],
    };
    write(route, true);
    remember();
    notify();
  };
  const go = ({ view, anchor } = {}, { replace = false } = {}) => {
    if (!VIEWS.has(view)) {
      return;
    }
    if (anchor === undefined && route.view === view) {
      return;
    }
    const target = targetFor(view, anchor, hashes);
    if (
      route.anchor === target.anchor &&
      env.location?.hash === target.anchor
    ) {
      return;
    }
    saveScroll();
    const oldURL = env.location?.href;
    route = visit(target, route, replace);
    write(route, replace);
    remember();
    notify();
    // pushState does not emit hashchange; existing chat/provider listeners need it.
    if (env.HashChangeEvent) {
      env.dispatchEvent(
        new env.HashChangeEvent('hashchange', {
          oldURL,
          newURL: env.location?.href,
        })
      );
    }
  };
  return {
    snapshot: () => route,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    go,
    restoring: (active) => {
      restoring = active;
    },
    back: (detail) => {
      const target = targetFor(detail.view, detail.anchor, hashes);
      if (route.previous === target.anchor) {
        env.history.back();
      } else {
        go(detail, { replace: true });
      }
    },
    start: () => {
      accept();
      write(route, true);
      remember();
      env.addEventListener?.('popstate', accept);
      env.addEventListener?.('hashchange', accept);
      env.addEventListener?.('scroll', saveScroll, { passive: true });
      return () => {
        env.removeEventListener?.('popstate', accept);
        env.removeEventListener?.('hashchange', accept);
        env.removeEventListener?.('scroll', saveScroll);
      };
    },
  };
};

let browserNavigation;
export const appNavigation = () =>
  (browserNavigation ??= createAppNavigation());
export const navigateApp = (detail, options) =>
  appNavigation().go(detail, options);
export const backInApp = (detail) => appNavigation().back(detail);
