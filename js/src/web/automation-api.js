// Automations, chat sending, typing status and the people directory for
// the SPA (issue #31 / PR #34). Each call prefers the local server, which
// holds every imported archive and the adapters' credentials, and falls
// back to the links this browser holds: offline the SPA still lists and
// edits automations, plans them, keeps safe-mode drafts in their chats,
// searches people and resolves audiences. Only delivering a message
// needs the server (or, from the chat composer, is stored locally until
// one syncs it).
//
// `remote` is `{ get(path), post(path, body), report(path, body),
// put(path, body), del(path) }` from ./dom.js; each answers null when no
// server (or no such route) is there.

import {
  AUTOMATION_PREFIX,
  RUN_PREFIX,
  automationPresets,
  normalizeAutomation,
  planAutomation,
} from '../automation/automations.js';
import {
  draftOperations,
  loadAutomation,
  queueDrafts,
} from '../automation/drafts.js';
import {
  AUDIENCE_PREFIX,
  LIST_PREFIX,
  audienceLink,
  buildPeople,
  listLink,
  resolveAudience,
  searchPeople,
} from '../crm/people.js';
import { isTypingActive, typingLink } from '../sources/live-links.js';

const SERVER_REQUIRED = Object.freeze({
  status: 'failed',
  code: 'server-required',
  error: 'sending needs the local server',
});

const withPrefix = (prefix, id) =>
  String(id).startsWith(prefix) ? String(id) : `${prefix}${id}`;

/** Saved automations first, then presets the user has not saved yet. */
export const listAutomations = (links) => {
  const saved = links
    .filter((l) => l?.id?.startsWith(AUTOMATION_PREFIX))
    .map((l) => {
      try {
        return { ...normalizeAutomation(l), saved: true };
      } catch (error) {
        return { id: l.id, name: l.name ?? l.id, invalid: error.message };
      }
    });
  const ids = new Set(saved.map((a) => a.id));
  return [
    ...saved,
    ...automationPresets()
      .filter((a) => !ids.has(a.id))
      .map((a) => ({ ...a, saved: false })),
  ];
};

/** The outgoing message as the chat stores it (`/api/send` does too). */
export const outgoingMessage = ({ source, chat, text }, { at, via } = {}) => {
  const when = at ?? new Date().toISOString();
  return {
    id: `msg:${source}:${chat}:out-${Date.parse(when)}`,
    tokens: ['message', source, String(chat)],
    source,
    chat: String(chat),
    sender: 'me',
    body: text,
    timestamp: when,
    ...(via ? { via } : {}),
  };
};

/** Drafts and safe-mode runs over the browser store. */
const localAutomations = (store) => {
  const load = (automation) => loadAutomation(store, automation);
  const nowIso = () => new Date().toISOString();
  const plan = async (automation, options = {}) =>
    planAutomation(await store.query(), await load(automation), {
      ...options,
      resolveAudience,
    });
  return {
    plan,
    async run(automation, options = {}) {
      const loaded = await load(automation);
      if (loaded.mode !== 'safe') {
        return { ...SERVER_REQUIRED, error: 'auto mode needs the server' };
      }
      const planned = await plan(loaded, options);
      return {
        ...planned,
        trigger: options.trigger ?? 'manual',
        queued: await queueDrafts(store, loaded, planned.drafts, nowIso()),
      };
    },
    ...draftOperations({
      store,
      load,
      nowIso,
      deliver: async () => SERVER_REQUIRED,
    }),
  };
};

const draftBody = (action, { id, text, form }) =>
  ({
    send: { id, confirm: true, text, form },
    form: { id, form },
  })[action] ?? { id };

const asOutcome = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    return { status: 'failed', code: error.code, error: error.message };
  }
};

const automationCalls = ({ remote, store, local }) => ({
  automations: async () =>
    (await remote.get('/api/automations'))?.automations ??
    listAutomations(await store.query()),
  saveAutomation: async (automation) => {
    const saved = normalizeAutomation(automation);
    await store.put(saved);
    return (await remote.put('/api/automations', { automation })) ?? saved;
  },
  deleteAutomation: async (id) => {
    const full = withPrefix(AUTOMATION_PREFIX, id);
    await store.delete(full);
    await remote.del(`/api/automations/${encodeURIComponent(full)}`);
    return { deleted: full };
  },
  planAutomation: async ({ automation, ...options }) =>
    (await remote.post('/api/automations/plan', { automation, ...options })) ??
    local.plan(automation, options),
  /** Errors come back as `{ status: 'failed', code, error }`. */
  runAutomation: async ({ automation, ...options }) =>
    asOutcome(
      async () =>
        (await remote.report('/api/automations/run', {
          automation,
          ...options,
        })) ?? local.run(automation, options)
    ),
  drafts: async ({ source, chat, automation } = {}) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries({ source, chat, automation })) {
      if (value !== undefined && value !== null) {
        q.set(key, String(value));
      }
    }
    return (
      (await remote.get(`/api/automations/drafts?${q}`))?.drafts ??
      local.drafts({ source, chat, automation })
    );
  },
  /** `action`: send (confirmed), form, mark or skip. */
  draftAction: async (action, draft) =>
    asOutcome(async () => {
      const body = draftBody(action, draft);
      const answer = await remote.report(
        `/api/automations/drafts/${action}`,
        body
      );
      if (answer) {
        return answer;
      }
      return {
        send: () => local.sendDraft(body.id, body),
        form: () => local.setDraftForm(body.id, body.form),
        mark: () => local.markSent(body.id),
        skip: () => local.skip(body.id),
      }[action]();
    }),
  automationHistory: async ({ automation } = {}) =>
    (
      await remote.get(
        `/api/automations/history${automation ? `?automation=${encodeURIComponent(automation)}` : ''}`
      )
    )?.records ??
    (await store.query())
      .filter((l) => l?.id?.startsWith(RUN_PREFIX))
      .filter((l) => !automation || l.automation === automation)
      .sort((a, b) => String(b.at).localeCompare(String(a.at))),
});

const chatCalls = ({ remote, store }) => ({
  /**
   * The composer: the server sends through the network's API, then its
   * official web UI. Without a server the message is stored locally so
   * it is not lost (`status: 'stored'`).
   */
  sendMessage: async (message) => {
    const answer = await remote.report('/api/send', message);
    if (answer?.link) {
      await store.put(answer.link);
      return answer;
    }
    if (answer) {
      return { status: 'failed', ...answer };
    }
    const link = outgoingMessage(message);
    await store.put(link);
    return { status: 'stored', link };
  },
  setTyping: async ({ source, chat }) => {
    const link = typingLink({ source, chat, user: 'me' });
    await store.put(link);
    return (
      (await remote.post('/api/typing', { source, chat })) ?? {
        supported: false,
        link,
      }
    );
  },
  typing: async ({ source, chat }) => {
    const q = new URLSearchParams({ source, chat: String(chat) });
    const remoteTyping = (await remote.get(`/api/typing?${q}`))?.typing;
    if (remoteTyping) {
      return remoteTyping;
    }
    const now = Date.now();
    return (await store.query()).filter(
      (l) =>
        l?.id?.startsWith('typing:') &&
        l.source === source &&
        String(l.chat) === String(chat) &&
        isTypingActive(l, now)
    );
  },
});

const peopleCalls = ({ remote, store }) => ({
  people: async ({ q = '', limit = 50 } = {}) =>
    (await remote.get(
      `/api/people?${new URLSearchParams({ q, limit: String(limit) })}`
    )) ?? searchPeople(buildPeople(await store.query()), q, { limit }),
  audiences: async () =>
    (await remote.get('/api/audiences')) ??
    (await store.query()).filter((l) => l?.id?.startsWith(AUDIENCE_PREFIX)),
  saveAudience: async ({ id, name, spec }) => {
    // A spec the server refuses (400) is refused locally the same way.
    const answer = await remote.put('/api/audiences', { id, name, spec });
    if (answer) {
      return answer;
    }
    return asOutcome(async () => {
      const link = audienceLink({ id, name, spec });
      const count = resolveAudience(
        [...(await store.query()).filter((l) => l.id !== link.id), link],
        link.spec
      ).length;
      await store.put(link);
      return { audience: link, count };
    });
  },
  deleteAudience: async (id) => {
    await store.delete(withPrefix(AUDIENCE_PREFIX, id));
    const key = withPrefix(AUDIENCE_PREFIX, id).slice(AUDIENCE_PREFIX.length);
    await remote.del(`/api/audiences/${encodeURIComponent(key)}`);
    return { deleted: withPrefix(AUDIENCE_PREFIX, id) };
  },
  resolveAudience: async ({ spec, limit = 200 }) => {
    const answer = await remote.report('/api/audiences/resolve', {
      spec,
      limit,
    });
    if (answer?.error) {
      return { status: 'failed', code: 'bad-audience', error: answer.error };
    }
    if (answer) {
      return answer;
    }
    return asOutcome(async () => {
      const people = resolveAudience(await store.query(), spec);
      return { count: people.length, people: people.slice(0, limit) };
    });
  },
  lists: async () =>
    (await remote.get('/api/lists')) ??
    (await store.query()).filter((l) => l?.id?.startsWith(LIST_PREFIX)),
  saveList: async ({ id, name, members }) => {
    const link = listLink({ id, name, members });
    await store.put(link);
    return (await remote.put('/api/lists', link)) ?? { list: link };
  },
});

/** Build the calls over a browser store and the server bridge. */
export const createAutomationApi = ({ remote, store }) => {
  const local = localAutomations(store);
  return {
    ...automationCalls({ remote, store, local }),
    ...chatCalls({ remote, store }),
    ...peopleCalls({ remote, store }),
  };
};
