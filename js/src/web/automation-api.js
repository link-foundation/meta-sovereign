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
// confirmed(path, body, ask),
// put(path, body), del(path) }` from ./dom.js; each answers null when no
// server (or no such route) is there.

import {
  AUTOMATION_PREFIX,
  RUN_PREFIX,
  automationPresets,
  normalizeAutomation,
  planAutomation,
} from '../automation/automations.js';
import { SETTINGS_ID, normalizeSettings } from '../automation/safety.js';
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
export const outgoingMessage = (
  { source, chat, text, clientId },
  { at, via, status } = {}
) => {
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
    ...(clientId ? { clientId } : {}),
    ...(status ? { status } : {}),
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
    send: { id, text, form },
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
  /**
   * Errors come back as `{ status: 'failed', code, error }`. Auto mode
   * sends: `ask(answer)` gets the planned drafts (`answer.preview`) and
   * resolves true to send exactly those; otherwise `{ status: 'cancelled' }`.
   */
  runAutomation: async ({ automation, ask, ...options }) =>
    asOutcome(
      async () =>
        (await remote.confirmed(
          '/api/automations/run',
          { automation, ...options },
          ask
        )) ??
        // Without a server auto mode answers "server required".
        local.run(automation, options)
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
      // The draft card's Send shows the very text: the press confirms it.
      const answer = await remote.confirmed(
        `/api/automations/drafts/${action}`,
        body,
        () => true
      );
      if (answer) {
        return answer;
      }
      return {
        send: () => local.sendDraft(body.id, { ...body, confirm: true }),
        form: () => local.setDraftForm(body.id, body.form),
        mark: () => local.markSent(body.id),
        skip: () => local.skip(body.id),
      }[action]();
    }),
  /**
   * The next chat the automation fits after `exclude` (R-Y86); `queue`
   * writes its draft for the chat to show. Needs the server.
   */
  nextDraft: async ({ automation, exclude = [], queue = false }) =>
    (await remote.post('/api/automations/next', {
      automation,
      exclude,
      queue,
    })) ?? { draft: null, code: 'server-required' },
  /** Back to the automation's own text, the user's edit forgotten. */
  resetEdit: async (automation) =>
    remote.post('/api/automations/edit/reset', { automation }),
  /** Every automation's autopilot state (R-Y87); [] without a server. */
  autopilots: async () =>
    (await remote.get('/api/automations/autopilot'))?.autopilots ?? [],
  /**
   * Turn an autopilot on (`ask(answer)` sees `answer.preview`: how many
   * chats, how paced, and confirms), off, or its monitor on or off.
   */
  autopilot: async ({ automation, on, monitor, ask }) => {
    const body = { automation, on, monitor };
    const answer =
      on === true
        ? await remote.confirmed('/api/automations/autopilot', body, ask)
        : await remote.post('/api/automations/autopilot', body);
    return answer ?? SERVER_REQUIRED;
  },
  /** The send log: every automated send and how it ended (R-Z3). */
  outbox: async ({ status } = {}) =>
    (
      await remote.get(
        `/api/automations/outbox${status ? `?status=${encodeURIComponent(status)}` : ''}`
      )
    )?.outbox ?? [],
  /** The user's decision about an unknown send: it arrived or not. */
  resolveOutbox: async ({ id, decision }) =>
    asOutcome(
      async () =>
        (await remote.post('/api/automations/outbox/resolve', {
          id,
          decision,
        })) ?? SERVER_REQUIRED
    ),
  /** Quiet hours, time zone and the opt-out list. */
  safetySettings: async () =>
    (await remote.get('/api/automations/settings')) ??
    normalizeSettings((await store.get(SETTINGS_ID)) ?? {}),
  saveSafetySettings: async (settings) => {
    const saved = normalizeSettings(settings);
    await store.put({
      id: SETTINGS_ID,
      tokens: ['automation-settings', 'global'],
      ...saved,
    });
    return (await remote.put('/api/automations/settings', saved)) ?? saved;
  },
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
   * it is not lost (`status: 'stored'`); a server that stopped answering
   * mid-send is a failure the composer tries again (`code: 'network'`).
   *
   * `message.clientId` names this one draft: the server sends a draft at
   * most once, so a retry (or a second request racing the first) never
   * posts it twice. The sent links live on the server and come back to
   * the chat with the answer and on its event stream.
   */
  sendMessage: async (message) => {
    // The composer's Send press confirms exactly this text.
    const answer = await remote.confirmed('/api/send', message, () => true, {
      network: true,
    });
    if (answer?.status === 'sent') {
      return {
        ...answer,
        links: answer.links ?? [answer.link].filter(Boolean),
      };
    }
    if (answer) {
      return { ...answer, status: 'failed' };
    }
    const link = outgoingMessage(message, { status: 'stored' });
    await store.put(link);
    return { status: 'stored', link, links: [link] };
  },
  // `cancel`: the message was sent or the box cleared — typing stops.
  setTyping: async ({ source, chat, cancel = false }) => {
    const link = typingLink({
      source,
      chat,
      user: 'me',
      ...(cancel ? { state: 'idle' } : {}),
    });
    await store.put(link);
    return (
      (await remote.post('/api/typing', {
        source,
        chat,
        ...(cancel ? { cancel: true } : {}),
      })) ?? {
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
