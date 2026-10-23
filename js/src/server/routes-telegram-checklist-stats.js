// Checklist extras, reaction reporting and the remaining statistics views
// (R-Y195; learned, never copied): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/send-todo {chat, title, items, othersCanAppend,
//                       othersCanComplete, clientId?, replyTo?, sendAs?,
//                       allowPaidStars?, silent?, scheduleDate?} -> { ok }
//                       a new checklist: a title of at most 32 characters,
//                       1 to 30 tasks of at most 64 each
//   POST /api/telegram/todo-append {chat, id, items} -> { ok, added }
//                       "Add tasks": 1 to 30 tasks of at most 64 each
//   POST /api/telegram/reaction-report {chat, id, peer} -> { ok } an
//                       admin reports the reaction user `peer` left
//   POST /api/telegram/message-stats {chat, id} -> { ok, graphs } a channel
//                       post's views and reactions graphs
//   POST /api/telegram/public-forwards {chat, id, offset?} -> { ok, count,
//                       items, next } the public shares of a post, paged
//   POST /api/telegram/stars-revenue {chat} -> { ok, graph, status,
//                       usdRate } a channel's (-100N) or a bot's (id)

import { paidField, validSendAs } from '../sources/telegram-send-as-client.js';
import { validSchedule } from '../sources/telegram-scheduled.js';
import { TODO_LIMITS } from '../sources/telegram-polls.js';

const CHAT = /^-?\d{1,20}$/;
const CHANNEL = /^-100\d{1,15}$/;
const USER = /^\d{1,15}$/;
const DIGITS = /^\d{1,20}$/;

const bad = [400, { error: 'a valid request required', code: 'bad-request' }];
const positive = (id) => Number.isInteger(id) && id > 0;
const textOk = (value, max) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/** 1 to 30 tasks, each at most 64 characters (Telegram's defaults). */
export const validTasks = (items) =>
  Array.isArray(items) &&
  items.length > 0 &&
  items.length <= TODO_LIMITS.items &&
  items.every((item) => textOk(item, TODO_LIMITS.item));

const validTodo = (b) =>
  CHAT.test(String(b.chat ?? '')) &&
  textOk(b.title, TODO_LIMITS.title) &&
  validTasks(b.items) &&
  typeof b.othersCanAppend === 'boolean' &&
  typeof b.othersCanComplete === 'boolean' &&
  validSendAs(b.sendAs) &&
  (b.silent === undefined || typeof b.silent === 'boolean') &&
  (b.scheduleDate === undefined || validSchedule(b.scheduleDate));

// Sent as another identity, the Stars confirmed, silent, at a time.
const whenOf = (body) => ({
  ...(body.sendAs === undefined ? {} : { sendAs: body.sendAs }),
  ...paidField(body),
  ...(body.silent === true ? { silent: true } : {}),
  ...(body.scheduleDate === undefined
    ? {}
    : { scheduleDate: body.scheduleDate }),
});

// The account's answer when the body is valid and it can do `name`.
const answer = async (account, name, valid, ask) =>
  valid && typeof account[name] === 'function' ? [200, await ask()] : bad;

const chatOf = (b) => String(b.chat ?? '');

export const CHECKLIST_STATS_POSTS = {
  'send-todo': (account, b) =>
    answer(account, 'sendTodo', validTodo(b), () => {
      const replyTo = Number(b.replyTo);
      return account.sendTodo({
        chat: b.chat,
        title: b.title.trim(),
        items: b.items.map((i) => i.trim()),
        othersCanAppend: b.othersCanAppend,
        othersCanComplete: b.othersCanComplete,
        replyTo: positive(replyTo) ? replyTo : null,
        clientId: typeof b.clientId === 'string' ? b.clientId : null,
        ...whenOf(b),
      });
    }),
  'todo-append': (account, b) =>
    answer(
      account,
      'appendTodo',
      CHAT.test(chatOf(b)) && positive(b.id) && validTasks(b.items),
      () =>
        account.appendTodo({
          chat: b.chat,
          id: b.id,
          items: b.items.map((i) => i.trim()),
        })
    ),
  'reaction-report': (account, b) =>
    answer(
      account,
      'reportReaction',
      CHAT.test(chatOf(b)) && positive(b.id) && DIGITS.test(String(b.peer)),
      () => account.reportReaction({ chat: b.chat, id: b.id, peer: b.peer })
    ),
  'message-stats': (account, b) =>
    answer(
      account,
      'messageStats',
      CHANNEL.test(chatOf(b)) && positive(b.id),
      () => account.messageStats({ chat: b.chat, id: b.id })
    ),
  'public-forwards': (account, b) =>
    answer(
      account,
      'publicForwards',
      CHANNEL.test(chatOf(b)) &&
        positive(b.id) &&
        (b.offset === undefined ||
          (typeof b.offset === 'string' && b.offset.length <= 512)),
      () =>
        account.publicForwards({
          chat: b.chat,
          id: b.id,
          ...(b.offset ? { offset: b.offset } : {}),
        })
    ),
  'stars-revenue': (account, b) =>
    answer(
      account,
      'starsRevenue',
      CHANNEL.test(chatOf(b)) || USER.test(chatOf(b)),
      () => account.starsRevenue({ chat: b.chat })
    ),
};
