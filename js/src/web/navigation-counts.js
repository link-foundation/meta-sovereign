// Menu badges share the queue's unread rules. Calls acknowledge the missed
// call notifications when their section is opened, independently of chat reads.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { operatorEligible } from './operator-model.js';
import { useOperatorScope } from './operator-prefs.js';
import { activeAccount } from './telegram-account-scope.js';
import { useOperatorWork } from './operator-work.js';

// Reuse the active screen's feed instead of opening another history stream.
let feed = { chats: [], links: [] };
const listeners = new Set();
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => feed;
export const usePublishChatFeed = (chats, links) => {
  useEffect(() => {
    if (links === null) {
      return;
    }
    feed = { chats, links };
    listeners.forEach((notify) => notify());
  }, [chats, links]);
};

export const callKey = (call) => `${call.chat}:${call.id}`;
export const missedCallCount = (calls, links, seen, started) => {
  const reads = new Map(
    links
      .filter((l) => l.id?.startsWith('read:telegram:'))
      .map((l) => [String(l.chat), l])
  );
  return calls.filter((call) => {
    if (
      !call.missed ||
      call.out ||
      call.date < seen.at ||
      (call.date === seen.at && seen.ids.includes(callKey(call)))
    ) {
      return false;
    }
    const read = reads.get(String(call.chat));
    return read
      ? Number(call.id) > Number(read.inboxMaxId ?? 0)
      : call.date >= started;
  }).length;
};

export const navigationCounts = (chats, missed = 0, scope, work = {}) => ({
  chat: chats.reduce(
    (sum, chat) =>
      sum + (chat.muted ? 0 : Math.max(0, Number(chat.unread) || 0)),
    0
  ),
  operator: chats.filter((chat) =>
    operatorEligible(chat, scope, Boolean(work[chat.key]))
  ).length,
  calls: missed,
});

const seenKey = () => `meta-sovereign.calls.seen.${activeAccount()}`;
const readSeen = () => {
  try {
    const value = JSON.parse(
      globalThis.localStorage?.getItem(seenKey()) ?? 'null'
    );
    if (Number.isFinite(value?.at) && Array.isArray(value.ids)) {
      return value;
    }
  } catch {
    /* Storage may be unavailable. */
  }
  return { at: 0, ids: [] };
};

const useMissedCalls = (api, revision) => {
  const [state, setState] = useState({ calls: [], next: null });
  useEffect(() => {
    let stopped = false;
    let busy = false;
    const load = async () => {
      if (busy || typeof api.telegramCalls !== 'function') {
        return;
      }
      busy = true;
      try {
        const status = await api.telegramStatus();
        if (!status?.connected || status.kind !== 'user') {
          if (!stopped) {
            setState({ calls: [], next: null });
          }
          return;
        }
        const result = await api.telegramCalls({ missed: true });
        if (!stopped && result?.ok) {
          setState({ calls: result.calls ?? [], next: result.next });
        }
      } catch {
        /* Keep the last known count during a transient outage. */
      } finally {
        busy = false;
      }
    };
    load();
    const timer = globalThis.setInterval(load, 30_000);
    globalThis.addEventListener?.('focus', load);
    return () => {
      stopped = true;
      globalThis.clearInterval(timer);
      globalThis.removeEventListener?.('focus', load);
    };
  }, [api, revision]);
  return state;
};

export const useNavigationCounts = (api, active) => {
  const work = useOperatorWork();
  const [scope] = useOperatorScope();
  const { chats, links } = useSyncExternalStore(subscribe, snapshot, snapshot);
  const revision = (links ?? [])
    .filter((l) => l.raw?.action?.className === 'MessageActionPhoneCall')
    .map((l) => l.id)
    .join();
  const { calls, next } = useMissedCalls(api, revision);
  const [seen, setSeen] = useState(readSeen);
  const started = useRef(Date.now());
  useEffect(() => {
    if (active !== 'calls' || !calls.length) {
      return;
    }
    const at = Math.max(...calls.map((call) => call.date), seen.at);
    const ids = [
      ...new Set([
        ...(at === seen.at ? seen.ids : []),
        ...calls.filter((c) => c.date === at).map(callKey),
      ]),
    ].sort();
    if (at !== seen.at || ids.join() !== [...seen.ids].sort().join()) {
      const value = { at, ids };
      setSeen(value);
      try {
        globalThis.localStorage?.setItem(seenKey(), JSON.stringify(value));
      } catch {
        /* The acknowledgement still lasts for this page. */
      }
    }
  }, [active, calls, seen]);
  const missed =
    active === 'calls'
      ? 0
      : missedCallCount(calls, links ?? [], seen, started.current);
  return {
    ...navigationCounts(chats, 0, scope, work),
    calls: { count: missed, more: Boolean(next) },
  };
};
