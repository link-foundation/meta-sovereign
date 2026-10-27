// One last-known conversation directory per API/account. Views share pending
// reads and live events; a refresh never replaces good data with a partial cache.
import { logOnce } from './api-errors.js';
import { activeAccount } from './telegram-account-scope.js';

export const applyLinkEvents = (links, events = []) => {
  if (!links || !events.length) {
    return links;
  }
  const byId = new Map(links.map((link) => [link.id, link]));
  for (const event of events) {
    if (event?.type === 'delete' && event.id) {
      byId.delete(event.id);
    } else if (event?.type === 'put' && event.link?.id) {
      byId.set(event.link.id, event.link);
    }
  }
  return [...byId.values()];
};

// One event stream per shared directory, including when Chat and badges coexist.
const followEvents = (feed, events) => {
  let users = 0;
  let close = null;
  return () => {
    users += 1;
    if (users === 1 && events) {
      let stopped = false;
      let stop = () => {};
      let timer = null;
      const buffer = [];
      const flush = () => {
        timer = null;
        feed.push(buffer.splice(0));
      };
      Promise.resolve(
        events(
          (event) => {
            if (stopped) {
              return;
            }
            buffer.push(event);
            timer ??= globalThis.setTimeout(flush, 80);
          },
          (state) => {
            if (stopped) {
              return;
            }
            feed.setLive(state === 'open');
            if (state === 'open') {
              feed.refresh();
            }
          }
        )
      ).then(
        (finish) => {
          if (stopped) {
            finish?.();
          } else {
            stop = finish ?? stop;
          }
        },
        () => {}
      );
      close = () => {
        stopped = true;
        stop();
        globalThis.clearTimeout(timer);
        flush();
        feed.setLive(false);
      };
    }
    return () => {
      users -= 1;
      if (!users) {
        close?.();
        close = null;
      }
    };
  };
};

export const createChatFeed = ({ load, events, retryMs = 5000 }) => {
  let state = { links: null, failed: null, refreshing: false, live: false };
  const listeners = new Set();
  let pending = null;
  let during = null;
  let retry = null;
  const publish = (change) => {
    state = { ...state, ...change };
    listeners.forEach((listener) => listener());
  };
  const accept = (links) => {
    if (!Array.isArray(links)) {
      throw new Error('The server did not return a conversation directory');
    }
    publish({ links: applyLinkEvents(links, during ?? []), failed: null });
  };
  const refresh = () => {
    if (pending) {
      return pending;
    }
    globalThis.clearTimeout(retry);
    during = [];
    publish({ refreshing: true });
    pending = Promise.resolve()
      .then(() => load(accept))
      .then(accept)
      .catch((error) => {
        logOnce('chat directory', error);
        publish({ failed: String(error?.message ?? error ?? 'failed') });
        if (listeners.size) {
          retry = globalThis.setTimeout(refresh, retryMs);
        }
      })
      .finally(() => {
        pending = null;
        during = null;
        publish({ refreshing: false });
      });
    return pending;
  };
  const feed = {
    setLive: (live) => publish({ live }),
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          globalThis.clearTimeout(retry);
        }
      };
    },
    refresh,
    push: (events) => {
      during?.push(...events);
      if (state.links !== null) {
        publish({ links: applyLinkEvents(state.links, events) });
      }
    },
  };
  feed.follow = followEvents(feed, events);
  return feed;
};

const feeds = new WeakMap();
export const chatFeedFor = (api, account = activeAccount()) => {
  let accounts = feeds.get(api);
  if (!accounts) {
    accounts = new Map();
    feeds.set(api, accounts);
  }
  if (!accounts.has(account)) {
    accounts.set(
      account,
      createChatFeed({
        events: api.events?.bind(api),
        load: (onProgress) =>
          api.chatLinks ? api.chatLinks({ onProgress }) : api.links(),
      })
    );
  }
  return accounts.get(account);
};
