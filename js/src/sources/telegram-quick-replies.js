/**
 * Quick replies, as Telegram Desktop's Settings → Telegram Business →
 * Quick Replies has them (R-Y179; learned, never copied). A shortcut is a
 * name ("hello") with a few messages kept on Telegram's side; they are
 * written to the user's own "chat" (InputPeerSelf) with the shortcut named:
 * - `quickReplies()` — messages.getQuickReplies → `{ ok, replies: [{ id,
 *   name, count, preview }] }`, in the order Telegram keeps;
 * - `quickReplyMessages({ shortcutId })` — messages.getQuickReplyMessages →
 *   `{ ok, messages: [{ id, text, media }] }`;
 * - `quickReplyCreate({ name, text })` — the shortcut made by sending its
 *   first message (messages.checkQuickReplyShortcut first) → `{ ok }`;
 * - `quickReplyAdd({ shortcutId, text })` — messages.sendMessage into it;
 * - `quickReplyEdit({ shortcutId, id, text })` — messages.editMessage with
 *   quickReplyShortcutId; `quickReplyDeleteMessages({ shortcutId, ids })`
 *   — messages.deleteQuickReplyMessages;
 * - `quickReplyRename({ shortcutId, name })` —
 *   messages.editQuickReplyShortcut; `quickReplyDelete({ shortcutId })` —
 *   messages.deleteQuickReplyShortcut; `quickReplyReorder({ order })` —
 *   messages.reorderQuickReplies;
 * - `quickReplySend({ chat, shortcutId })` — the shortcut's messages sent
 *   to a chat (messages.sendQuickReplyMessages), only when asked.
 * Telegram's refusals (Premium needed, name taken, too many) become codes.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';
import { randomIdOf } from './telegram-send.js';

export const NAME = /^[\p{L}\p{N}_]{1,32}$/u;
const ID = /^\d{1,10}$/;
const TEXT_MAX = 4096;

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  BUSINESS_PEER_INVALID: 'no-access',
  SHORTCUT_INVALID: 'bad-name',
  SHORTCUT_OCCUPIED: 'name-taken',
  QUICK_REPLIES_TOO_MUCH: 'too-many',
  MESSAGE_TOO_LONG: 'too-long',
  MESSAGE_EMPTY: 'empty',
  MESSAGE_NOT_MODIFIED: 'unchanged',
  PEER_ID_INVALID: 'no-access',
  USER_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};

export const quickFailure = failureOf(CODES);

const bad = (code) => ({ ok: false, error: code, code });
const MEDIA = {
  MessageMediaPhoto: 'photo',
  MessageMediaDocument: 'file',
  MessageMediaGeo: 'location',
  MessageMediaContact: 'contact',
  MessageMediaPoll: 'poll',
};
const mediaOf = (message) =>
  message?.media ? (MEDIA[message.media.className] ?? 'file') : null;

const shapeMessage = (m) => ({
  id: Number(m.id),
  text: String(m.message ?? ''),
  media: mediaOf(m),
});

const shapeReplies = (answer) => {
  const tops = new Map((answer?.messages ?? []).map((m) => [Number(m.id), m]));
  return (answer?.quickReplies ?? []).map((q) => {
    const top = tops.get(Number(q.topMessage));
    return {
      id: Number(q.shortcutId),
      name: String(q.shortcut),
      count: Number(q.count ?? 0),
      preview: top ? shapeMessage(top).text || mediaOf(top) || '' : '',
    };
  });
};

// A trimmed text of a sensible length, or the code that refuses it.
const textProblem = (text) => {
  const value = String(text ?? '');
  if (value.trim() === '') {
    return 'empty';
  }
  return Array.from(value).length > TEXT_MAX ? 'too-long' : null;
};

const ids = (list) =>
  Array.isArray(list) &&
  list.length > 0 &&
  list.length <= 100 &&
  list.every((n) => Number.isInteger(n) && n > 0);

const shortcutOf = (c, key) =>
  new c.Api.InputQuickReplyShortcutId({ shortcutId: Number(key) });

const toolsOf = (env, userClient) => {
  const run = (key, use) => runIn(env, `quick-replies:${key}`, use);
  const act = (key, use) =>
    connected(env, userClient, quickFailure, (c) =>
      run(key, () => use(c)).then((r) => r ?? { ok: true })
    );
  const invoke = (c, request) => c.client.invoke(request);

  const messagesOf = async (c, shortcutId) => {
    const answer = await invoke(
      c,
      new c.Api.messages.GetQuickReplyMessages({
        shortcutId: Number(shortcutId),
        hash: c.zero,
      })
    );
    return (answer?.messages ?? []).map(shapeMessage);
  };

  const sendInto = (c, shortcut, text) =>
    invoke(
      c,
      new c.Api.messages.SendMessage({
        peer: new c.Api.InputPeerSelf(),
        message: String(text),
        randomId: randomIdOf(null, 0, c.helpers),
        quickReplyShortcut: shortcut,
      })
    );

  return { env, act, invoke, messagesOf, sendInto };
};

const readActions = ({ act, invoke, messagesOf }) => ({
  quickReplies: () =>
    act('list', async (c) => ({
      ok: true,
      replies: shapeReplies(
        await invoke(c, new c.Api.messages.GetQuickReplies({ hash: c.zero }))
      ),
    })),
  quickReplyMessages: async ({ shortcutId } = {}) =>
    ID.test(String(shortcutId))
      ? act(`messages:${shortcutId}`, async (c) => ({
          ok: true,
          messages: await messagesOf(c, shortcutId),
        }))
      : bad('bad-request'),
});

const writeActions = ({ env, act, invoke, messagesOf, sendInto }) => ({
  quickReplyCreate: async ({ name, text } = {}) => {
    const problem = NAME.test(String(name ?? ''))
      ? textProblem(text)
      : 'bad-name';
    if (problem) {
      return bad(problem);
    }
    return act('create', async (c) => {
      const free = await invoke(
        c,
        new c.Api.messages.CheckQuickReplyShortcut({ shortcut: name })
      );
      if (free === false) {
        return bad('name-taken');
      }
      await sendInto(
        c,
        new c.Api.InputQuickReplyShortcut({ shortcut: name }),
        text
      );
      return { ok: true };
    });
  },
  quickReplyAdd: async ({ shortcutId, text } = {}) => {
    const problem = ID.test(String(shortcutId))
      ? textProblem(text)
      : 'bad-request';
    return problem
      ? bad(problem)
      : act(`add:${shortcutId}`, async (c) => {
          await sendInto(c, shortcutOf(c, shortcutId), text);
          return { ok: true };
        });
  },
  quickReplyEdit: async ({ shortcutId, id, text } = {}) => {
    const problem =
      ID.test(String(shortcutId)) && ID.test(String(id))
        ? textProblem(text)
        : 'bad-request';
    return problem
      ? bad(problem)
      : act(`edit:${shortcutId}`, async (c) => {
          await invoke(
            c,
            new c.Api.messages.EditMessage({
              peer: new c.Api.InputPeerSelf(),
              id: Number(id),
              message: String(text),
              quickReplyShortcutId: Number(shortcutId),
            })
          );
          return { ok: true };
        });
  },
  quickReplyDeleteMessages: async ({ shortcutId, ids: list } = {}) =>
    ID.test(String(shortcutId)) && ids(list)
      ? act(`delete-messages:${shortcutId}`, async (c) => {
          await invoke(
            c,
            new c.Api.messages.DeleteQuickReplyMessages({
              shortcutId: Number(shortcutId),
              id: list,
            })
          );
          return { ok: true };
        })
      : bad('bad-request'),
  quickReplyRename: async ({ shortcutId, name } = {}) =>
    ID.test(String(shortcutId)) && NAME.test(String(name ?? ''))
      ? act(`rename:${shortcutId}`, async (c) => {
          await invoke(
            c,
            new c.Api.messages.EditQuickReplyShortcut({
              shortcutId: Number(shortcutId),
              shortcut: name,
            })
          );
          return { ok: true };
        })
      : bad(ID.test(String(shortcutId)) ? 'bad-name' : 'bad-request'),
  quickReplyDelete: async ({ shortcutId } = {}) =>
    ID.test(String(shortcutId))
      ? act(`delete:${shortcutId}`, async (c) => {
          await invoke(
            c,
            new c.Api.messages.DeleteQuickReplyShortcut({
              shortcutId: Number(shortcutId),
            })
          );
          return { ok: true };
        })
      : bad('bad-request'),
  quickReplyReorder: async ({ order } = {}) =>
    ids(order)
      ? act('reorder', async (c) => {
          await invoke(c, new c.Api.messages.ReorderQuickReplies({ order }));
          return { ok: true };
        })
      : bad('bad-request'),
  quickReplySend: async ({ chat, shortcutId } = {}) =>
    /^\d{1,20}$/.test(String(chat ?? '')) && ID.test(String(shortcutId))
      ? act(`send:${chat}`, async (c) => {
          const list = await messagesOf(c, shortcutId);
          if (list.length === 0) {
            return bad('empty');
          }
          await env.connection.withPeer(c.client, String(chat), (peer) =>
            invoke(
              c,
              new c.Api.messages.SendQuickReplyMessages({
                peer,
                shortcutId: Number(shortcutId),
                id: list.map((m) => m.id),
                randomId: list.map((_, i) => randomIdOf(null, i, c.helpers)),
              })
            )
          );
          return { ok: true, sent: list.length };
        })
      : bad('bad-request'),
});

export const createQuickReplies = (env, { userClient }) => {
  const tools = toolsOf(env, userClient);
  return { ...readActions(tools), ...writeActions(tools) };
};
