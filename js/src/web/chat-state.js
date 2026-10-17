// State behind the chat screen (issue #31 / PR #34): the chat list and
// search, the composer with message-to-message suggestions, typing status
// both ways, the chat's automation menu and its pending drafts. All data
// flows through the injected `api` (./dom.js in the SPA), so the screen
// renders in tests with a fake one.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chatKey,
  chatMenuAutomations,
  chatMessages,
  senderNames,
  summarizeChats,
  typingStatus,
} from './chat-model.js';
import { localizePreset } from './automations-model.js';
import { readShareTyping } from './privacy-prefs.js';
import { useComposer, useLiveLinks } from './chat-live.js';
import { isTypingActive } from '../sources/live-links.js';

const TYPING_EVERY_MS = 4000;

export const defaultConfirm = (message) =>
  typeof globalThis.confirm === 'function'
    ? globalThis.confirm(message)
    : false;

const useInterval = (fn, ms, deps) => {
  useEffect(() => {
    if (!ms || typeof globalThis.setInterval !== 'function') {
      return undefined;
    }
    const id = globalThis.setInterval(fn, ms);
    return () => globalThis.clearInterval(id);
  }, deps);
};

/** Load once per `deps`, ignoring answers that arrive after a change. */
export const useLoaded = (load, deps, initial) => {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(load)
      .then(
        (next) => live && next !== undefined && setValue(next),
        () => {}
      );
    return () => {
      live = false;
    };
  }, deps);
  return [value, setValue];
};

const useSuggestions = (api, current, text, tick) => {
  const [suggest] = useLoaded(
    () =>
      current
        ? api.suggest({
            source: current.source,
            chat: current.chat,
            typed: text,
          })
        : { stage: 'none', suggestions: [] },
    [api, current?.key, text, tick],
    { stage: 'none', suggestions: [] }
  );
  return suggest ?? { stage: 'none', suggestions: [] };
};

// "typing…" reaches the other person, so it is sent only when the user
// turned it on (Settings → Privacy) and only for real keystrokes.
const useTypingOut = (api, current, shareTyping = readShareTyping) => {
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (!current || !shareTyping() || now - last.current < TYPING_EVERY_MS) {
      return;
    }
    last.current = now;
    api
      .setTyping({ source: current.source, chat: current.chat })
      .catch(() => {});
  }, [api, current?.key]);
};

export const runNotice = (result) => {
  if (result.code || result.status === 'failed') {
    return { kind: 'failed', error: result.error ?? result.code };
  }
  if (result.queued) {
    return {
      kind: result.queued.length ? 'queued' : 'nothing',
      count: result.queued.length,
      reason: result.excluded?.[0]?.reason ?? null,
    };
  }
  const sent = (result.results ?? []).filter((r) => r.status === 'sent');
  return { kind: 'sent-auto', count: sent.length };
};

const useAutomationMenu = ({ api, current, confirm, t, after }) => {
  const [automations] = useLoaded(() => api.automations(), [api], []);
  const [open, setOpen] = useState(false);
  const run = async (automation, { test }) => {
    setOpen(false);
    const result = await api.runAutomation({
      automation: automation.id,
      trigger: 'chat-menu',
      test,
      targets: [{ source: current.source, chat: current.chat }],
      // Auto mode: confirm the planned message(s) before they go out.
      ask: (answer) =>
        confirm(
          t('chat.automation.confirmAuto', {
            name: automation.name,
            count: answer.preview?.drafts?.length ?? 0,
          })
        ),
    });
    if (result?.cancelled) {
      return null;
    }
    after(runNotice(result ?? { code: 'no-answer' }));
    return result;
  };
  return {
    automations: chatMenuAutomations(automations).map((a) =>
      localizePreset(t, a)
    ),
    open,
    toggle: () => setOpen((v) => !v),
    run,
  };
};

const useDrafts = ({ api, current, tick, after }) => {
  const [drafts, setDrafts] = useLoaded(
    () =>
      current ? api.drafts({ source: current.source, chat: current.chat }) : [],
    [api, current?.key, tick],
    []
  );
  const act = async (action, draft) => {
    const result = await api.draftAction(action, draft);
    if (action === 'form' && result?.id) {
      setDrafts((all) => all.map((d) => (d.id === result.id ? result : d)));
      return result;
    }
    after(
      result?.status === 'failed'
        ? { kind: 'failed', error: result.error ?? result.code }
        : { kind: `draft-${action}` }
    );
    return result;
  };
  const edit = (id, text) =>
    setDrafts((all) => all.map((d) => (d.id === id ? { ...d, text } : d)));
  return { drafts: drafts ?? [], act, edit };
};

const STATUS_EVERY_MS = 4000;

/**
 * The connected Telegram account behind Chat: its status (who, last sync,
 * an error) polled while the screen is open, a fresh link load whenever a
 * sync wrote something, and "Sync now".
 */
const useTelegramAccount = (
  api,
  refresh,
  { pollMs = STATUS_EVERY_MS, live = false } = {}
) => {
  const [status, setStatus] = useState(null);
  const seen = useRef(undefined);
  // With the event stream open, changes arrive by themselves; a reload
  // on `changedAt` is only for when it is not.
  const streamed = useRef(live);
  streamed.current = live;
  const supported = typeof api.telegramStatus === 'function';
  const load = useCallback(() => {
    if (!supported) {
      return Promise.resolve(null);
    }
    return api.telegramStatus().then(
      (next) => {
        setStatus(next);
        const changed = next?.changedAt ?? null;
        if (
          seen.current !== undefined &&
          changed !== seen.current &&
          !streamed.current
        ) {
          refresh();
        }
        seen.current = changed;
        return next;
      },
      () => null
    );
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);
  // Faster while a sync runs, so its result shows as soon as it lands.
  const every = status?.syncing ? Math.min(pollMs, 1000) : pollMs;
  useInterval(load, supported ? every : 0, [load, every]);
  const [syncing, setSyncing] = useState(false);
  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await api.telegramSync({ full: true });
      setStatus((before) => ({ ...(before ?? {}), ...result }));
      refresh();
      return result;
    } finally {
      setSyncing(false);
    }
  };
  return {
    ...(status ?? { connected: false }),
    syncing: syncing || Boolean(status?.syncing),
    syncNow,
  };
};

// Opening a Telegram chat pulls more of its history once per visit.
const useChatHistory = (api, current, refresh) => {
  const loaded = useRef(new Set());
  useEffect(() => {
    if (
      current?.source !== 'telegram' ||
      typeof api.telegramHistory !== 'function' ||
      loaded.current.has(current.key)
    ) {
      return;
    }
    loaded.current.add(current.key);
    api.telegramHistory(current.chat).then(
      (result) => result?.written > 0 && refresh(),
      () => {}
    );
  }, [api, current?.key]);
};

/** `#chat=<source>:<chat>` — a chat opened from Contacts. */
export const chatFromHash = (hash = '') => {
  const match = /^#chat=([a-z0-9_-]+):(.+)$/i.exec(String(hash));
  return match
    ? { source: match[1], chat: decodeURIComponent(match[2]) }
    : null;
};

const useHashChat = () => {
  const read = () => chatFromHash(globalThis.location?.hash);
  const [target, setTarget] = useState(read);
  useEffect(() => {
    const onHash = () => setTarget(read());
    globalThis.addEventListener?.('hashchange', onHash);
    return () => globalThis.removeEventListener?.('hashchange', onHash);
  }, []);
  return target;
};

/**
 * A chat with no messages here yet (a contact never written to, or one
 * whose history is still loading), named from its person link.
 */
export const emptyChat = (links = [], { source, chat }) => {
  const person = links.find((l) => l?.id === `person:${source}:${chat}`);
  return {
    key: chatKey(source, chat),
    source,
    chat: String(chat),
    name: person?.name ?? person?.handle ?? String(chat),
    personal: true,
    people: [String(chat)],
    count: 0,
    last: { body: '', mine: false, at: null },
    search: '',
    empty: true,
  };
};

/**
 * Who types in a chat: the polled list, overridden by what the event
 * stream said since (their message arrived, so they stopped), plus
 * typing only the stream has seen yet.
 */
export const mergeTyping = (polled, links, key, now = Date.now()) => {
  if (!key) {
    return [];
  }
  const streamed = new Map(
    links
      .filter(
        (l) => l?.id?.startsWith('typing:') && chatKey(l.source, l.chat) === key
      )
      .map((l) => [l.id, l])
  );
  const fresher = (t) => {
    const live = streamed.get(t.id);
    return live && String(live.at) >= String(t.at) ? live : t;
  };
  const list = polled.map(fresher);
  for (const link of streamed.values()) {
    if (!list.some((t) => t.id === link.id)) {
      list.push(link);
    }
  }
  return list.filter((t) => isTypingActive(t, now));
};

/** Everything the chat screen shows and does. */
export const useChatState = (
  api,
  { t, confirm = defaultConfirm, pollMs = 2500 } = {}
) => {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const { links, live, add } = useLiveLinks(api, tick, refresh);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [notice, setNotice] = useState(null);
  const telegram = useTelegramAccount(api, refresh, { live });
  const target = useHashChat();
  const all = useMemo(() => {
    const list = summarizeChats(links ?? []);
    if (
      !target ||
      list.some((c) => c.key === chatKey(target.source, target.chat))
    ) {
      return list;
    }
    return [emptyChat(links ?? [], target), ...list];
  }, [links, target]);
  useEffect(() => {
    if (target) {
      setActive(chatKey(target.source, target.chat));
    }
  }, [target?.source, target?.chat]);
  const chats = useMemo(
    () => (query ? summarizeChats(links ?? [], { query }) : all),
    [links, query, all]
  );
  useEffect(() => {
    if (all.length && !all.some((c) => c.key === active)) {
      setActive(all[0].key);
    }
  }, [all, active]);
  const current = all.find((c) => c.key === active) ?? null;
  useChatHistory(api, current, refresh);
  const after = (next) => {
    setNotice(next);
    refresh();
  };
  const composer = useComposer({
    api,
    current,
    after: setNotice,
    addLinks: add,
    typingOut: useTypingOut(api, current),
  });
  const messages = useMemo(
    () =>
      current
        ? chatMessages(links ?? [], current.key, { pending: composer.pending })
        : [],
    [links, current?.key, composer.pending]
  );

  const [typing, setTyping] = useLoaded(
    () =>
      current ? api.typing({ source: current.source, chat: current.chat }) : [],
    [api, current?.key, tick],
    []
  );
  useInterval(
    () => {
      if (current) {
        api
          .typing({ source: current.source, chat: current.chat })
          .then(setTyping, () => {});
      }
    },
    pollMs,
    [api, current?.key, pollMs]
  );
  const typingNow = mergeTyping(typing ?? [], links ?? [], current?.key);
  return {
    loading: links === null,
    live,
    telegram,
    chats,
    total: all.length,
    query,
    setQuery,
    current,
    select: (key) => {
      setActive(key);
      setNotice(null);
    },
    messages,
    typing: typingStatus(typingNow, { names: senderNames(messages) }),
    composer,
    suggest: useSuggestions(api, current, composer.text, tick),
    menu: useAutomationMenu({ api, current, confirm, t, after }),
    drafts: useDrafts({ api, current, tick, after }),
    notice,
    dismiss: () => setNotice(null),
    refresh,
  };
};
