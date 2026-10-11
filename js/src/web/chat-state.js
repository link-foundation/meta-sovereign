// State behind the chat screen (issue #31 / PR #34): the chat list and
// search, the composer with message-to-message suggestions, typing status
// both ways, the chat's automation menu and its pending drafts. All data
// flows through the injected `api` (./dom.js in the SPA), so the screen
// renders in tests with a fake one.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chatMenuAutomations,
  chatMessages,
  senderNames,
  summarizeChats,
  typingStatus,
} from './chat-model.js';

const TYPING_EVERY_MS = 4000;

const defaultConfirm = (message) =>
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
const useLoaded = (load, deps, initial) => {
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

const useTypingOut = (api, current) => {
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (!current || now - last.current < TYPING_EVERY_MS) {
      return;
    }
    last.current = now;
    api
      .setTyping({ source: current.source, chat: current.chat })
      .catch(() => {});
  }, [api, current?.key]);
};

const runNotice = (result) => {
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
    const auto = automation.mode === 'auto';
    if (
      auto &&
      !confirm(t('chat.automation.confirmAuto', { name: automation.name }))
    ) {
      return null;
    }
    const result = await api.runAutomation({
      automation: automation.id,
      trigger: 'chat-menu',
      test,
      confirm: auto,
      targets: [{ source: current.source, chat: current.chat }],
    });
    after(runNotice(result ?? { code: 'no-answer' }));
    return result;
  };
  return {
    automations: chatMenuAutomations(automations),
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

const useComposer = ({ api, current, after }) => {
  const [text, setText] = useState('');
  const typingOut = useTypingOut(api, current);
  const send = async () => {
    const body = text.trim();
    if (!body || !current) {
      return null;
    }
    const result = await api.sendMessage({
      source: current.source,
      chat: current.chat,
      text: body,
    });
    if (result?.status === 'failed') {
      after({ kind: 'failed', error: result.error ?? result.code });
      return result;
    }
    setText('');
    after(result?.status === 'stored' ? { kind: 'stored' } : null);
    return result;
  };
  return {
    text,
    setText: (next) => {
      setText(next);
      if (next) {
        typingOut();
      }
    },
    send,
  };
};

/** Everything the chat screen shows and does. */
export const useChatState = (
  api,
  { t, confirm = defaultConfirm, pollMs = 2500 } = {}
) => {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const [links] = useLoaded(() => api.links(), [api, tick], null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [notice, setNotice] = useState(null);
  const all = useMemo(() => summarizeChats(links ?? []), [links]);
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
  const messages = useMemo(
    () => (current ? chatMessages(links ?? [], current.key) : []),
    [links, current?.key]
  );
  const after = (next) => {
    setNotice(next);
    refresh();
  };

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

  const composer = useComposer({ api, current, after });
  return {
    loading: links === null,
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
    typing: typingStatus(typing ?? [], { names: senderNames(messages) }),
    composer,
    suggest: useSuggestions(api, current, composer.text, tick),
    menu: useAutomationMenu({ api, current, confirm, t, after }),
    drafts: useDrafts({ api, current, tick, after }),
    notice,
    dismiss: () => setNotice(null),
    refresh,
  };
};
