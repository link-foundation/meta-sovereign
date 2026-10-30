import { getLocalStorage } from '../storage/local-storage.js';

// State behind the chat screen (issue #31 / PR #34): the chat list and
// search, the composer with message-to-message suggestions, typing status
// both ways, the chat's automation menu and its pending drafts. All data
// flows through the injected `api` (./dom.js in the SPA), so the screen
// renders in tests with a fake one.

import {
  navigateApp,
  parseAppRoute,
  chatHash,
  splitChatAddress,
} from './app-route.js';
import { telegramStatusFor } from './telegram-status.js';
import { logOnce } from './api-errors.js';
import { traceClient } from './client-log.js';
import { useDraftPresentation } from './chat-draft-state.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRetryingRead } from './read-retry.js';
import {
  CHAT_FILTERS,
  CHAT_SORTS,
  sortChats,
  folderChats,
  archiveSummary,
  chatKey,
  chatMenuAutomations,
  cloudDraft,
  filterChats,
  firstUnreadId,
  networkMessageId,
  readInboxUpTo,
  senderNames,
  summarizeChats,
  typingStatus,
} from './chat-model.js';
import { localizePreset } from './automations-model.js';
import { readReadReceipts, readShareTyping } from './privacy-prefs.js';
import { useComposer, useLiveLinks } from './chat-live.js';
import { useNotifications } from './chat-notify.js';
import { useReplyTargets } from './chat-replies.js';
import { useEphemeral } from './chat-ephemeral.js';
import { useChatInfo } from './chat-info.js';
import { useChatlistUpdates } from './chat-folder-updates.js';
import { requestsLinkOf } from './chat-join-requests.js';
import { callLinkOf } from './voice-chat-model.js';
import { callLinkOf as privateCallLinkOf } from './private-call-model.js';
import { isTypingActive } from '../sources/live-links.js';
import {
  useChatWindow,
  useMoreChats,
  usePrefetch,
  windowMessages,
} from './chat-window.js';
import { splitTopicKey } from './forum-topics.js';
import { useTranscriptFeed } from './chat-transcribe.js';
import { useExportFeed } from './chat-export.js';
import { topicMessages, useForumTopics, viewedChat } from './chat-topics.js';
import { useAutopilotBase } from './autopilot-hook.js';
import {
  chatsInFolder,
  folderKey,
  folderTabs,
  isFolderFilter,
  peopleOf,
  useAllFirst,
  useFolderTools,
  useTelegramFolders,
} from './chat-folders.js';
import { tagMap } from './chat-folder-tags.js';
import { usePublishChatFeed } from './navigation-counts.js';

export { shownAutopilot } from './autopilot-hook.js';

const TYPING_EVERY_MS = 4000;

// The chat's pinned message: the one Telegram names, unless a newer one
// held was pinned since or it was unpinned; else the newest held that is
// marked pinned.
const pinnedOf = (messages, pinnedId, known) => {
  const named = pinnedId
    ? (messages.find((m) => m.id === pinnedId) ?? known.get(pinnedId))
    : null;
  const newest =
    messages.findLast?.((m) => m.raw?.pinned && !m.deleted) ?? null;
  const usable = named && !named.deleted && named.raw?.pinned !== false;
  if (!usable) {
    return newest;
  }
  return newest && networkMessageId(newest) > networkMessageId(named)
    ? newest
    : named;
};

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
  const [error, setError] = useState(null); // R-Z12: never a silent hang
  useEffect(() => {
    const read = createRetryingRead(load, {
      accept: (next) => {
        setError(null);
        if (next !== undefined) {
          setValue(next);
        }
      },
      failed: (failure) => {
        logOnce('load', failure);
        setError(failure);
      },
    });
    read.refresh();
    return read.stop;
  }, deps);
  return [value, setValue, error];
};

const NO_SUBSCRIBE = () => () => {};

// The newest message the screen shows in the open chat.
const newestShown = (messages) =>
  messages.findLast?.(
    (m) => !m.service && !m.deleted && String(m.id).startsWith('msg:')
  ) ?? null;

/**
 * Reply suggestions (R-Y70): `local(typed)` from the browser's copy of
 * the reply index, at once (null until it is loaded); `remote(typed)`
 * from the server, which keeps every rare reply. The copy loads once,
 * and asks the server what it learned whenever links arrive.
 */
const useSuggester = (api, current, messages, links) => {
  const [cache, setCache] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(api.replyCache?.()).then(
      (found) => {
        if (live && found) {
          found.start();
          setCache(found);
        }
      },
      () => {}
    );
    return () => {
      live = false;
    };
  }, [api]);
  const revision = useSyncExternalStore(
    cache?.subscribe ?? NO_SUBSCRIBE,
    () => cache?.revision() ?? 0,
    () => 0
  );
  // Asked again when a message arrives (not a typing or read mark).
  const heard = useMemo(
    () => (links ?? []).filter((l) => String(l.id).startsWith('msg:')).length,
    [links]
  );
  useEffect(() => {
    cache?.nudge();
  }, [cache, heard]);
  const hint = newestShown(messages);
  return useMemo(
    () => ({
      key: current?.key ?? null,
      revision,
      local: (typed) =>
        current && cache?.ready()
          ? cache.autocomplete({
              source: current.source,
              chat: current.chat,
              hint,
              typed,
            })
          : null,
      remote: (typed) =>
        current
          ? api.suggest({ source: current.source, chat: current.chat, typed })
          : Promise.resolve(null),
    }),
    [api, cache, revision, current?.key, hint]
  );
};

// "typing…" reaches the other person, so it is sent only when the user
// turned it on (Settings → Privacy) and only for real keystrokes. Sending
// the message or clearing the box stops it at once (`cancel`), as
// Telegram's apps do, instead of leaving "typing…" for 6 more seconds.
const TYPING_SHOWN_MS = 6000;

const useTypingOut = (api, current, shareTyping = readShareTyping) => {
  const last = useRef(0);
  const set = (cancel) =>
    api
      .setTyping({
        source: current.source,
        chat: current.chat,
        ...(cancel ? { cancel: true } : {}),
      })
      .catch(() => {});
  return useMemo(
    () => ({
      start: () => {
        const now = Date.now();
        if (
          !current ||
          !shareTyping() ||
          now - last.current < TYPING_EVERY_MS
        ) {
          return;
        }
        last.current = now;
        set(false);
      },
      cancel: () => {
        if (!current || Date.now() - last.current > TYPING_SHOWN_MS) {
          return;
        }
        last.current = 0;
        set(true);
      },
    }),
    [api, current?.key]
  );
};

const READ_AFTER_MS = 500;

const pageActive = () => {
  const doc = globalThis.document;
  return (
    doc?.visibilityState !== 'hidden' &&
    (typeof doc?.hasFocus === 'function' ? doc.hasFocus() : true)
  );
};

/**
 * Reading a Telegram chat marks it read there (Telegram Web and TDLib do
 * the same): the view reports the newest incoming message on screen
 * (`seen`), and while the window is in front, half a second later, the
 * chat is marked read up to it — never backwards, never twice. Off when
 * the user turned read receipts off (Settings → Privacy).
 */
const useReadMarker = (
  api,
  current,
  inboxMaxId,
  enabled = readReadReceipts
) => {
  const seen = useRef(0);
  const marked = useRef(new Map()); // chat key → the id marked up to
  const timer = useRef(null);
  const latest = useRef({ current, inboxMaxId });
  latest.current = { current, inboxMaxId };

  const flush = useCallback(() => {
    timer.current = null;
    const { current: chat, inboxMaxId: read } = latest.current;
    if (
      chat?.source !== 'telegram' ||
      typeof api.telegramRead !== 'function' ||
      !enabled() ||
      !pageActive()
    ) {
      return;
    }
    const upTo = seen.current;
    if (upTo <= Math.max(read, marked.current.get(chat.key) ?? 0)) {
      return;
    }
    marked.current.set(chat.key, upTo);
    api
      .telegramRead({
        chat: chat.chat,
        maxId: upTo,
        // A forum topic is read on its own (R-Y122).
        ...(chat.topic ? { topic: chat.topic } : {}),
      })
      .then(
        (answer) => answer?.error && marked.current.delete(chat.key),
        () => marked.current.delete(chat.key)
      );
  }, [api]);
  const schedule = useCallback(() => {
    globalThis.clearTimeout(timer.current);
    timer.current = globalThis.setTimeout(flush, READ_AFTER_MS);
  }, [flush]);

  useEffect(() => {
    seen.current = 0;
  }, [current?.key]);
  useEffect(() => {
    const doc = globalThis.document;
    globalThis.addEventListener?.('focus', schedule);
    doc?.addEventListener?.('visibilitychange', schedule);
    return () => {
      globalThis.removeEventListener?.('focus', schedule);
      doc?.removeEventListener?.('visibilitychange', schedule);
      globalThis.clearTimeout(timer.current);
    };
  }, [schedule]);

  return useCallback(
    (id) => {
      if (id > seen.current) {
        seen.current = id;
        schedule();
      }
    },
    [schedule]
  );
};

const boundaryRead = (current, inboxMaxId, last) =>
  (!current?.topic && current?.unread === 0) ||
  (last !== null && inboxMaxId >= last);

/**
 * Capture the opening unread boundary, as Telegram does. Partial reads
 * must not move it through the list, but a fully read boundary is retired:
 * later live messages must not resurrect an old opening divider.
 */
const useUnreadLine = (current, inboxMaxId, loaded, messages) => {
  const at = useRef({ key: null, after: null, last: null });
  if (loaded && at.current.key !== (current?.key ?? null)) {
    at.current = {
      key: current?.key ?? null,
      after: current?.unread > 0 || current?.topic ? inboxMaxId : null,
      last: null,
    };
  }
  if (at.current.after !== null) {
    const incoming = messages.findLast(
      (m) =>
        m.sender !== 'me' &&
        !m.pending &&
        !m.ephemeral &&
        (networkMessageId(m) ?? 0) > at.current.after
    );
    at.current.last ??= incoming ? networkMessageId(incoming) : null;
    if (boundaryRead(current, inboxMaxId, at.current.last)) {
      at.current.after = null;
    }
  }
  return at.current.after;
};

/**
 * Other networks (R-Y38): opening a chat that has unread messages marks
 * it read there too — through the API, or the network's web app — once
 * per chat until new messages arrive.
 */
const useOtherReadMarker = (api, current, enabled = readReadReceipts) => {
  const marked = useRef(new Map()); // chat key → the unread count marked
  const key = current?.key;
  const unread = current?.unread ?? 0;
  useEffect(() => {
    if (
      !current ||
      current.source === 'telegram' ||
      unread <= 0 ||
      marked.current.get(key) === unread ||
      typeof api.messageAction !== 'function' ||
      !enabled() ||
      !pageActive()
    ) {
      return;
    }
    marked.current.set(key, unread);
    api
      .messageAction('read', { source: current.source, chat: current.chat })
      .then(
        (answer) => answer?.error && marked.current.delete(key),
        () => marked.current.delete(key)
      );
  }, [api, key, unread]);
};

// What reading the open chat needs: where it was read up to, the marker
// and the unread line.
// `topicRead`: where an open forum topic is read up to (R-Y122); the
// chat's own marker otherwise.
const useReading = (
  api,
  current,
  links,
  topicRead = null,
  autoRead = true,
  messages = []
) => {
  const chatRead = current
    ? readInboxUpTo(links ?? [], splitTopicKey(current.key).key)
    : 0;
  const inboxMaxId = current?.topic ? (topicRead ?? chatRead) : chatRead;
  const enabled = () => autoRead && readReadReceipts();
  useOtherReadMarker(api, current, enabled);
  return {
    seen: useReadMarker(api, current, inboxMaxId, enabled),
    unreadAfter: useUnreadLine(current, inboxMaxId, links !== null, messages),
  };
};

const runFailed = (result) =>
  !result ||
  result.code ||
  result.error ||
  result.ok === false ||
  (result.httpStatus ?? 0) >= 400 ||
  result.status === 'failed';

export const runNotice = (result) => {
  if (runFailed(result)) {
    return {
      kind: 'failed',
      error: result?.error ?? result?.code ?? 'no-answer',
    };
  }
  if (Array.isArray(result.queued)) {
    return {
      kind: result.queued.length ? 'queued' : 'nothing',
      count: result.queued.length,
      reason: result.excluded?.[0]?.reason ?? null,
    };
  }
  if (!Array.isArray(result.results)) {
    return { kind: 'failed', error: 'no-answer' };
  }
  const sent = (result.results ?? []).filter((r) => r.status === 'sent');
  return { kind: 'sent-auto', count: sent.length };
};

const traceAutomationResult = (api, target, test, started, result) =>
  traceClient(api, 'automation_run_result', {
    chat: target.chat,
    test,
    queued: result?.queued?.length ?? 0,
    failed: Boolean(runFailed(result)),
    durationMs: Date.now() - started,
  });

const useAutomationMenu = ({ api, current, confirm, t, after, drafts }) => {
  const [automations] = useLoaded(() => api.automations(), [api], []);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(null);
  const pending = useRef(false);
  const latest = useRef(current);
  latest.current = current;
  const run = async (automation, { test }) => {
    if (pending.current || !current) {
      return null;
    }
    const target = current;
    pending.current = true;
    setRunning({ id: automation.id, test });
    const started = Date.now();
    traceClient(api, 'automation_run_start', {
      source: target.source,
      chat: target.chat,
      automation: automation.id,
      test,
    });
    try {
      const result = await api.runAutomation({
        automation: automation.id,
        trigger: 'chat-menu',
        test,
        targets: [{ source: target.source, chat: target.chat }],
        // Auto mode: confirm the planned message(s) before they go out.
        ask: (answer) =>
          confirm(
            t('chat.automation.confirmAuto', {
              name: automation.name,
              count: answer.preview?.drafts?.length ?? 0,
            })
          ),
      });
      traceAutomationResult(api, target, test, started, result);
      if (!result?.cancelled && latest.current?.key === target.key) {
        drafts.present(result?.queued ?? []);
        after(runNotice(result));
      }
      return result;
    } catch (error) {
      traceClient(api, 'automation_run_error', {
        chat: target.chat,
        code: error.code ?? 'internal',
      });
      if (latest.current?.key === target.key) {
        after({ kind: 'failed', error: error.message });
      }
      return null;
    } finally {
      pending.current = false;
      setRunning(null);
      if (latest.current?.key === target.key) {
        setOpen(false);
      }
    }
  };
  return {
    automations: chatMenuAutomations(automations).map((a) =>
      localizePreset(t, a)
    ),
    open,
    toggle: () => setOpen((v) => !v),
    close: () => setOpen(false),
    run,
    running,
  };
};

/** `#chat=<source>:<chat>`: opens that chat (Contacts, the autopilot). */
export const openChat = (target) =>
  navigateApp({ view: 'chat', anchor: chatHash(target) });

/**
 * After a draft is settled, the next chat its automation fits (R-Y86):
 * `next` names it; `open()` writes its draft — the user's edited text
 * carried over — and opens the chat.
 */
const useNextChat = (api, current, show) => {
  const [next, setNext] = useState(null);
  useEffect(() => setNext(null), [current?.key]);
  const look = async (draft) => {
    if (typeof api.nextDraft !== 'function' || !draft?.automation) {
      return;
    }
    const exclude = [{ source: draft.source, chat: String(draft.chat) }];
    const found = await api
      .nextDraft({ automation: draft.automation, exclude })
      .catch(() => null);
    setNext(
      found?.draft
        ? { automation: draft.automation, name: found.name, ...found, exclude }
        : null
    );
  };
  const open = async () => {
    if (!next) {
      return;
    }
    const queued = await api
      .nextDraft({
        automation: next.automation,
        exclude: next.exclude,
        queue: true,
      })
      .catch(() => null);
    const target = queued?.draft ?? next.draft;
    setNext(null);
    show(target);
  };
  return { next, look, open, dismiss: () => setNext(null) };
};

const failedNotice = (result) => ({
  kind: 'failed',
  code: result.code ?? null,
  error: result.error ?? result.code,
});

const useDrafts = ({ api, current, tick, after, show, setNotice }) => {
  const [drafts, setDrafts] = useLoaded(
    () =>
      current ? api.drafts({ source: current.source, chat: current.chat }) : [],
    [api, current?.key, tick],
    []
  );
  const view = useDraftPresentation(drafts, setDrafts, current, setNotice);
  const following = useNextChat(api, current, show);
  const act = async (action, draft) => {
    const result = await api.draftAction(action, draft);
    if (action === 'form' && result?.id) {
      view.forget(draft.id);
      setDrafts((all) => all.map((d) => (d.id === result.id ? result : d)));
      return result;
    }
    if (result?.status === 'failed') {
      after(failedNotice(result));
      return result;
    }
    view.forget(draft.id);
    after({ kind: `draft-${action}` });
    await following.look(draft);
    return result;
  };
  /** The automation's own text again in this draft. */
  const reset = async (draft) => {
    await api.resetEdit?.(draft.automation);
    return act('form', draft);
  };
  return {
    ...view,
    act,
    reset,
    next: following.next,
    openNext: following.open,
    dismissNext: following.dismiss,
  };
};

/**
 * The automations' autopilots (R-Y87): wraps the shared base hook with
 * the chat-screen navigation — when `monitor` is on, opening the chat
 * the autopilot is currently writing to.
 */
const useAutopilot = ({ api, links, live, tick, confirm, t, active, show }) => {
  const base = useAutopilotBase({ api, links, live, tick, confirm, t });
  const { shown } = base;
  const target = shown?.on && shown.monitor ? shown.current : null;
  useEffect(() => {
    if (target && chatKey(target.source, target.chat) !== active) {
      show(target);
    }
  }, [target?.source, target?.chat]);
  return base;
};

const STATUS_EVERY_MS = 4000;

/**
 * The connected Telegram account behind Chat: its status (who, last sync,
 * an error) polled while the screen is open, a fresh link load whenever a
 * sync wrote something. It syncs by itself (no "Sync now", R-Y75).
 */
const useTelegramAccount = (
  api,
  refresh,
  { pollMs = STATUS_EVERY_MS, live = false } = {}
) => {
  const resource = useMemo(() => telegramStatusFor(api), [api]);
  const [status, setStatus] = useState(resource.snapshot);
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
    return resource.read().then(
      (next) => {
        if (!next || next.offline === true || next.error) {
          return next;
        }
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
  return {
    ...(status ?? { connected: false }),
    ready: status !== null,
    syncing: Boolean(status?.syncing),
  };
};

const FILTER_KEY = 'meta-sovereign.chat.filter';
const SORT_KEY = 'meta-sovereign.chat.sort';

// One of `options`, remembered in this browser (the first is the default).
const useRemembered = (
  key,
  options,
  { storage = getLocalStorage(), accept = (v) => options.includes(v) } = {}
) => {
  const read = () => {
    try {
      const saved = storage?.getItem(key);
      return accept(saved) ? saved : options[0];
    } catch {
      return options[0];
    }
  };
  const [value, setValue] = useState(read);
  const choose = (next) => {
    const chosen = accept(next) ? next : options[0];
    setValue(chosen);
    try {
      storage?.setItem(key, chosen);
    } catch {
      // Private mode: the choice lasts until the page closes.
    }
  };
  return [value, choose];
};

// All / Private / Groups / Channels, and newest or oldest first.
// The list's own tabs, or one of Telegram's folders (R-Y103).
const useChatFilter = () =>
  useRemembered(FILTER_KEY, CHAT_FILTERS, {
    accept: (v) => CHAT_FILTERS.includes(v) || isFolderFilter(v),
  });
const useChatSort = () => useRemembered(SORT_KEY, CHAT_SORTS);

/** `#chat=<source>:<chat>` — a chat opened from Contacts. */
export const chatFromHash = (hash = '', view = 'chat') => {
  const route = parseAppRoute(hash);
  return route?.view === view ? (route.chat ?? null) : null;
};

const useHashChat = (view) => {
  const read = () => chatFromHash(globalThis.location?.hash, view);
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
// What a search across Telegram said of a chat not in the list yet
// (R-Y107): its name and kind, until its messages say.
const chatHints = new Map();
const KIND_OF_PEER = { user: 'private', bot: 'private' };

/** Remember a found chat's name and kind (`user`, `bot`, `group`…). */
export const hintChat = ({ source, chat, name, kind }) => {
  if (name) {
    chatHints.set(chatKey(source, String(chat)), {
      name,
      kind: KIND_OF_PEER[kind] ?? kind ?? 'private',
    });
  }
};

export const emptyChat = (links = [], { source, chat }) => {
  const person = links.find((l) => l?.id === `person:${source}:${chat}`);
  const hint = chatHints.get(chatKey(source, String(chat)));
  const kind = hint?.kind ?? 'private';
  return {
    key: chatKey(source, chat),
    source,
    chat: String(chat),
    name: person?.name ?? person?.handle ?? hint?.name ?? String(chat),
    personal: kind === 'private',
    kind,
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

// Who types in the open chat: polled, and kept current by the stream.
const useTypingIn = (api, current, { tick, pollMs, links }) => {
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
  return mergeTyping(typing ?? [], links ?? [], current?.key);
};

/**
 * The chat list: every chat newest first (with a chat opened from
 * Contacts that has no messages yet), and the ones the search and the
 * tab show.
 */
const NO_ARCHIVE = Object.freeze({ count: 0, unread: 0, names: [] });
const OWN_TABS = CHAT_FILTERS.map((key) => ({
  key,
  label: `chat.filter.${key}`,
  unread: 0,
}));

// Telegram folders and the independent type filter compose (R-Z27); a remembered
// tab that is not there now shows every chat.
const shownFilter = (filter, folders) => {
  const named = folders.filter((f) => !f.all);
  const folder = isFolderFilter(filter)
    ? (named.find((f) => folderKey(f) === filter) ?? null)
    : null;
  if (named.length > 0) {
    return { filter: folder ? filter : 'all', folder };
  }
  return { filter: isFolderFilter(filter) ? 'all' : filter, folder: null };
};

const useChatList = (links, target, query, folders = []) => {
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
  const [remembered, setFilter] = useChatFilter();
  const [kindFilter, setKindFilter] = useRemembered(
    'meta-sovereign.chat.kind',
    [CHAT_FILTERS.includes(remembered) ? remembered : 'all', ...CHAT_FILTERS]
  );
  const [sort, setSort] = useChatSort();
  const [allFirst] = useAllFirst();
  // Telegram's main list or the archive; a search looks through both,
  // and through every folder.
  const [folder, setFolder] = useState('main');
  const people = useMemo(() => peopleOf(links ?? []), [links]);
  const shown = shownFilter(remembered, folders);
  const tabFolder = query ? null : shown.folder;
  const filter = shown.filter;
  const hasFolders = folders.some((f) => !f.all);
  const chooseFilter = (value) => {
    setFilter(value);
    if (!hasFolders) {
      setKindFilter(value);
    }
  };
  const kind = hasFolders ? kindFilter : filter;
  // The folder tags on the rows, but the open folder's (R-Y180).
  const tags = useMemo(
    () => tagMap(all, folders, people, tabFolder?.id ?? null),
    [all, folders, people, tabFolder]
  );
  const chats = useMemo(
    () =>
      sortChats(
        filterChats(
          tabFolder
            ? chatsInFolder(all, tabFolder, people)
            : query
              ? summarizeChats(links ?? [], { query })
              : folderChats(all, folder),
          kind
        ),
        sort
      ),
    [links, query, all, kind, sort, folder, tabFolder, people]
  );
  const archive = useMemo(() => archiveSummary(all), [all]);
  const tabs = useMemo(
    () => folderTabs(folders, { all, people, fallback: OWN_TABS, allFirst }),
    [folders, all, people, allFirst]
  );
  return {
    all,
    chats,
    filter,
    setFilter: chooseFilter,
    kindFilter: hasFolders ? kindFilter : null,
    setKindFilter,
    tabs,
    sort,
    setSort,
    // A folder lists its archived chats among the rest, as Telegram's.
    folder: archive.count > 0 && !shown.folder ? folder : 'main',
    setFolder,
    archive: shown.folder ? NO_ARCHIVE : archive,
    tags,
  };
};

/** Everything the chat screen shows and does. */
// Opening a chat: from the list (`select`; the open one clicked again
// asks it to go to its newest, `toEnd` counting the asks, as in Desktop,
// R-Y109), or from a search across Telegram (`openAt`, R-Y107) at a
// message when one was found — `arrival` until the chat has gone to it.
const useOpening = ({ show, current, setActive, setNotice, followHash }) => {
  const [arrival, setArrival] = useState(null);
  const [toEnd, setToEnd] = useState(0);
  return {
    select: (key) => {
      if (key === current?.key) {
        setToEnd((n) => n + 1);
      }
      if (followHash) {
        const chat = splitChatAddress(key);
        navigateApp({ view: 'chat', anchor: chat ? chatHash(chat) : '' });
      }
      setActive(key);
      setNotice(null);
    },
    toEnd,
    // `topic`: a forum topic to open first (a link names it, R-Y161);
    // `maybeTopic`: an id that is a topic if the forum has one by it.
    openAt: (target, id = null, { topic = null, maybeTopic = null } = {}) => {
      hintChat(target);
      show(target);
      setNotice(null);
      setArrival(
        id
          ? {
              key: chatKey(target.source, String(target.chat)),
              id,
              ...(topic ? { topic } : {}),
              ...(maybeTopic ? { maybeTopic } : {}),
            }
          : null
      );
    },
    arrival,
    arrived: () => setArrival(null),
  };
};

// A forum's topics, and the chat as its window sees it: the topic open
// has its own window and its own read mark (R-Y122).
const useTopicView = (api, current, tick) => {
  const forum = useForumTopics(api, current, tick);
  const viewed = useMemo(
    () => viewedChat(current, forum.topic),
    [current, forum.topic]
  );
  return { forum, viewed, readMax: forum.open?.readInboxMaxId ?? null };
};

// The link id of the chat's pinned message, when it has one.
const pinnedLinkId = (info, current) =>
  info?.pinned && current
    ? `msg:${current.source}:${current.chat}:${info.pinned}`
    : null;

// A bot's messages for this user only are among them by date (R-Y223);
// `links` come back with those added, for the replies to them.
const useShownMessages = (api, links, current, window, pending, topic) => {
  const shown = useMemo(
    () =>
      current
        ? topicMessages(
            windowMessages(links ?? [], current.key, window, { pending }),
            topic
          )
        : [],
    [links, current?.key, pending, window, topic]
  );
  return useEphemeral(api, current, links, shown, topic);
};

const useHistory = (api, current, links, tick, telegram) => {
  const telegramAvailable =
    telegram.connected && telegram.kind === 'user' && !telegram.needsLogin;
  return {
    history: useChatWindow(api, current, links, tick, { telegramAvailable }),
    prefetch: usePrefetch(api, links, { enabled: telegramAvailable }),
  };
};

const useCurrentChat = (all, target, selectFirst) => {
  const [active, setActive] = useState(() =>
    target ? chatKey(target.source, target.chat) : ''
  );
  useEffect(() => {
    if (target) {
      setActive(chatKey(target.source, target.chat));
    }
  }, [target?.source, target?.chat]);
  useEffect(() => {
    if (selectFirst && all.length && !all.some((c) => c.key === active)) {
      setActive(all[0].key);
    }
  }, [all, active, selectFirst]);
  const current = all.find((c) => c.key === active) ?? null;
  return [active, setActive, current];
};

export const useChatState = (
  api,
  {
    t,
    confirm = defaultConfirm,
    pollMs = 2500,
    autoRead = true,
    followHash = true,
    selectFirst = true,
    hashView = 'chat',
  } = {}
) => {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const { links, live, add, failed, retry } = useLiveLinks(api, tick, refresh);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState(null);
  const telegram = useTelegramAccount(api, refresh, { live });
  const hashTarget = useHashChat(hashView);
  const target = followHash ? hashTarget : null;
  const folders = useTelegramFolders(api, telegram);
  const list = useChatList(links, target, query, folders);
  const folderTools = useFolderTools(api, folders, list.all);
  // New chats in shared folders the user joined (R-Y211).
  const folderUpdates = useChatlistUpdates(api, folders);
  const { all, chats, filter, setFilter, sort, setSort } = list;
  usePublishChatFeed(all, links);
  const [active, setActive, current] = useCurrentChat(all, target, selectFirst);
  // A chat's name by its key (where a forward came from).
  const chatName = useMemo(() => {
    const names = new Map(all.map((c) => [c.key, c.name]));
    return (key) => names.get(key) ?? null;
  }, [all]);
  const { forum, viewed, readMax } = useTopicView(api, current, tick);
  const { history, prefetch } = useHistory(api, viewed, links, tick, telegram);
  const moreChats = useMoreChats(api, telegram, live ? null : refresh);
  const after = (next) => {
    setNotice(next);
    refresh();
  };
  // Open a chat by its address: in the list even with no message here
  // yet (the hash), and the open one at once.
  const show = (target) => {
    openChat(target);
    setActive(chatKey(target.source, String(target.chat)));
  };
  const opening = useOpening({
    show,
    current,
    setActive,
    setNotice,
    followHash: followHash && hashView === 'chat',
  });
  // The first look is the list as loaded, not the opened chat alone.
  useNotifications({ chats: links ? all : [], current, show, t, api });
  const composer = useComposer({
    api,
    current,
    after: setNotice,
    addLinks: add,
    typing: useTypingOut(api, current),
    cloud: cloudDraft(links ?? [], current?.key),
    topic: forum.topic,
  });
  const { messages, links: known } = useShownMessages(
    api,
    links,
    current,
    history.window,
    composer.pending,
    forum.topic
  );
  const info = useChatInfo(api, current);
  const pinnedId = pinnedLinkId(info, current);
  const replyTargets = useReplyTargets(api, messages, known, history.window, [
    pinnedId,
  ]);
  const { seen, unreadAfter } = useReading(
    api,
    viewed,
    links,
    readMax,
    autoRead,
    messages
  );

  const typingNow = useTypingIn(api, current, { tick, pollMs, links });
  // Voice transcriptions the server learned (R-Y175).
  useTranscriptFeed(links);
  // How far a chat's history export is (R-Y186).
  useExportFeed(links);
  const drafts = useDrafts({ api, current, tick, after, show, setNotice });
  return {
    loading: links === null,
    loadError: failed,
    retryLoad: retry,
    addLinks: add,
    live,
    telegram,
    all,
    chats,
    total: all.length,
    chatName,
    // Whether a chat is in the list (a link to its message opens here).
    hasChat: (key) => all.some((c) => c.key === key),
    query,
    setQuery,
    filter,
    setFilter,
    tabs: list.tabs,
    kindFilter: list.kindFilter,
    setKindFilter: list.setKindFilter,
    // Folder tags by chat key (R-Y180).
    tags: list.tags,
    // The tabs' menu: edit, delete, reorder (R-Y164).
    folderTools,
    folders,
    folderUpdates,
    sort,
    setSort,
    folder: list.folder,
    setFolder: list.setFolder,
    archive: list.archive,
    prefetch,
    moreChats,
    history,
    current,
    forum,
    info,
    // Who waits to join, as Telegram last said (R-Y161).
    joinRequests: requestsLinkOf(links, current),
    // The chat's voice chat, live (R-Y188).
    groupCall: callLinkOf(links, current),
    // A private call, live (R-Y196).
    privateCall: privateCallLinkOf(links),
    pinned: pinnedOf(messages, pinnedId, replyTargets),
    ...opening,
    messages,
    replyTargets,
    unreadLine: firstUnreadId(messages, unreadAfter),
    seen,
    typing: typingStatus(typingNow, {
      names: senderNames([...replyTargets.values(), ...messages]),
    }),
    composer,
    suggester: useSuggester(api, current, messages, links),
    menu: useAutomationMenu({ api, current, confirm, t, after, drafts }),
    drafts,
    autopilot: useAutopilot({
      api,
      links,
      live,
      tick,
      confirm,
      t,
      active,
      show,
    }),
    notice,
    dismiss: () => setNotice(null),
    notify: setNotice,
    refresh,
  };
};
