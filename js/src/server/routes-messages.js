/**
 * What the user does to messages of any network (R-Y38): the network's
 * API first, its own web app second (../sources/message-actions.js).
 *
 *   GET  /api/message/supports?source=  -> { source, actions: { edit:
 *                                          { api, browser }, … } }
 *   POST /api/message/edit    { ids: [id], text, caption?, noWebpage?,
 *                              invertMedia?, previewUrl?, previewSize? }
 *   POST /api/message/delete  { ids, revoke? }    (revoke: for everyone)
 *   POST /api/message/react   { ids: [id], emoji }   ('' takes ours back)
 *   POST /api/message/read    { source, chat, ids? } the chat read up to
 *                                                     the newest of ids
 *   POST /api/message/forward { ids, toChat }
 *        -> { ok, via: 'api' | 'browser', … }
 *
 * Messages are named by their link ids (`msg:<source>:…`), all in one
 * chat; the server finds them in the store. What the network now says is
 * written back at once (the new text, the deletion, our reaction, the
 * read mark), so Chat shows it before the next sync. Only the app's own
 * pages may ask (a JSON body from an allowed origin).
 */

import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { previewFields } from '../sources/telegram-link-preview.js';

import { markDeleted as tombstone } from '../storage/soft-delete.js';

const PREFIX = '/api/message/';
const MAX_IDS = 100;

const fail = (res, status, code, error) =>
  json(res, status, { error, code }) ?? true;

/** The network's own id of a message: the last part of its link id. */
export const externalIdOf = (link) =>
  String(link.messageId ?? String(link.id).split(':').pop());

// The messages a request names, all from one chat of one network.
const messagesOf = async (store, body) => {
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, MAX_IDS) : [];
  const links = [];
  for (const id of ids) {
    const link =
      typeof id === 'string' && id.startsWith('msg:')
        ? await store.get(id)
        : null;
    if (link && !link.deleted) {
      links.push(link);
    }
  }
  const one = links.every(
    (l) =>
      l.source === links[0]?.source && String(l.chat) === String(links[0]?.chat)
  );
  return one ? links : [];
};

const now = () => new Date().toISOString();

// Our own reaction on a message, among the others'.
const withReaction = (reactions = [], emoji) => {
  const others = reactions
    .map((r) => (r.mine ? { ...r, count: (r.count ?? 1) - 1, mine: false } : r))
    .filter((r) => r.count > 0);
  if (!emoji) {
    return others;
  }
  const same = others.find((r) => r.emoji === emoji);
  return same
    ? others.map((r) =>
        r === same ? { ...r, count: r.count + 1, mine: true } : r
      )
    : [...others, { emoji, count: 1, mine: true }];
};

// action -> { check(body, links) -> error|null, params, after(store) }
const ACTIONS = {
  edit: {
    // `caption: true`: a message with media, its caption may be emptied;
    // the link preview fields as a send has them (R-Y145, R-Y146).
    check: (body, links) =>
      links.length === 1 &&
      typeof body.text === 'string' &&
      (body.text.trim() || body.caption === true) &&
      previewFields(body)
        ? null
        : 'one message id and the new text are needed',
    params: (body, [link]) => ({
      id: externalIdOf(link),
      text: body.text,
      link,
      ...previewFields(body),
    }),
    after: (store, body, [link]) =>
      store.put({ ...link, body: body.text || '📎', edited: now() }),
  },
  delete: {
    check: (body, links) => (links.length ? null : 'message ids are needed'),
    params: (body, links) => ({
      ids: links.map(externalIdOf),
      revoke: Boolean(body.revoke),
      links,
    }),
    after: async (store, body, links) => {
      for (const link of links) {
        await store.put(
          tombstone(link, { by: 'user', reason: 'deleted-in-app', at: now() })
        );
      }
    },
  },
  react: {
    check: (body, links) =>
      links.length === 1 &&
      (body.emoji === '' || (typeof body.emoji === 'string' && body.emoji))
        ? null
        : 'one message id and an emoji are needed',
    params: (body, [link]) => ({
      id: externalIdOf(link),
      emoji: body.emoji,
      link,
    }),
    after: (store, body, [link]) =>
      store.put({
        ...link,
        reactions: withReaction(link.reactions, body.emoji),
      }),
  },
  read: {
    check: (body, links) =>
      links.length || (body.source && body.chat)
        ? null
        : 'source and chat are needed',
    params: (body, links) => {
      const ids = links.map(externalIdOf).map(Number).filter(Number.isFinite);
      return {
        maxId: ids.length ? Math.max(...ids) : undefined,
        id: links.at(-1) ? externalIdOf(links.at(-1)) : undefined,
        link: links.at(-1),
      };
    },
    after: async (store, body, links, target) => {
      const id = `read:${target.source}:${target.chat}`;
      const read = (await store.get(id)) ?? {
        id,
        source: target.source,
        chat: target.chat,
      };
      const maxId = links.map(externalIdOf).map(Number).filter(Number.isFinite);
      await store.put({
        ...read,
        unreadCount: 0,
        readAt: now(),
        ...(maxId.length
          ? {
              inboxMaxId: Math.max(Number(read.inboxMaxId ?? 0), ...maxId),
            }
          : {}),
      });
    },
  },
  forward: {
    check: (body, links) =>
      links.length && body.toChat ? null : 'message ids and toChat are needed',
    params: (body, links) => ({
      fromChat: links[0].chat,
      ids: links.map(externalIdOf),
      toChat: String(body.toChat),
      toTitle: typeof body.toTitle === 'string' ? body.toTitle : undefined,
      links,
    }),
    after: async () => {},
  },
};

// An item pulled before its network id was kept is refused (R-Z11).
const FAILURE_STATUS = {
  'flood-wait': 429,
  'unsupported-action': 501,
  'no-external-id': 409,
};

const handleAction = async (store, req, res, ctx, name) => {
  const action = ACTIONS[name];
  const body = await readBody(req);
  const links = await messagesOf(store, body);
  const problem = action.check(body, links);
  if (problem) {
    return fail(res, 400, 'bad-request', problem);
  }
  const target = {
    source: links[0]?.source ?? String(body.source),
    chat: String(links[0]?.chat ?? body.chat),
  };
  try {
    const result = await ctx.send.perform(name, {
      ...target,
      ...action.params(body, links),
    });
    await action.after(store, body, links, target);
    return json(res, 200, { ok: true, ...result, links: undefined }) ?? true;
  } catch (error) {
    ctx.log?.({
      level: 'warn',
      event: 'message_action_failed',
      action: name,
      source: target.source,
      code: error.code ?? null,
    });
    const status = FAILURE_STATUS[error.code] ?? 502;
    return (
      json(res, status, {
        error: error.message,
        code: error.code ?? 'action-failed',
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      }) ?? true
    );
  }
};

export const handleMessageRoutes = async (store, req, res, p, url, ctx) => {
  if (!p.startsWith(PREFIX)) {
    return false;
  }
  if (typeof ctx.send?.perform !== 'function') {
    return fail(res, 501, 'no-sender', 'no message actions are configured');
  }
  const name = p.slice(PREFIX.length);
  if (name === 'supports' && req.method === 'GET') {
    const source = url.searchParams.get('source') ?? '';
    return (
      json(res, 200, { source, actions: ctx.send.supports(source) }) ?? true
    );
  }
  if (req.method !== 'POST' || !Object.hasOwn(ACTIONS, name)) {
    return false;
  }
  if (!isTrustedMutation(req, ctx.allowOrigins)) {
    return fail(
      res,
      403,
      'forbidden',
      'message actions must come from the meta-sovereign app'
    );
  }
  return handleAction(store, req, res, ctx, name);
};
