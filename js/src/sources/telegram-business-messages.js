/**
 * The greeting and the away message of Telegram Business, as Telegram
 * Desktop's Settings → Telegram Business has them (R-Y179; learned, never
 * copied). Each one sends a quick reply shortcut to chats automatically:
 * - `businessMessages()` — users.getFullUser of the user (UserFull.
 *   businessGreetingMessage / businessAwayMessage) and messages.
 *   getQuickReplies → `{ ok, greeting, away, shortcuts: [{ id, name }],
 *   people: [{ id, name }] }`; `greeting` is `null` (off) or `{ shortcutId,
 *   recipients, noActivityDays }`, `away` `null` or `{ shortcutId,
 *   recipients, offlineOnly, schedule: { kind: 'always' | 'outside' |
 *   'custom', start?, end? } }` (times in seconds); `recipients` is
 *   `{ existingChats, newChats, contacts, nonContacts, excludeSelected,
 *   users: [id] }`;
 * - `businessGreetingSave({ enabled, shortcutId, recipients,
 *   noActivityDays })` — account.updateBusinessGreetingMessage (off: no
 *   message);
 * - `businessAwaySave({ enabled, shortcutId, recipients, offlineOnly,
 *   schedule })` — account.updateBusinessAwayMessage.
 * Writes come only from the page's Save. Telegram's refusals (Premium
 * needed…) become codes.
 */

import { connected, runIn } from './telegram-stickers.js';
import { quickFailure } from './telegram-quick-replies.js';

const ID = /^\d{1,10}$/;
const USER = /^\d{1,20}$/;
export const DAYS = [7, 14, 21, 28];
export const SCHEDULES = ['always', 'outside', 'custom'];
const FLAGS = [
  'existingChats',
  'newChats',
  'contacts',
  'nonContacts',
  'excludeSelected',
];

const bad = (code) => ({ ok: false, error: code, code });
const textOf = (value) => String(value?.value ?? value);

const recipientsOf = (r) => ({
  ...Object.fromEntries(FLAGS.map((k) => [k, Boolean(r?.[k])])),
  users: (r?.users ?? []).map(textOf),
});

const scheduleOf = (s) => {
  switch (s?.className) {
    case 'BusinessAwayMessageScheduleCustom':
      return {
        kind: 'custom',
        start: Number(s.startDate),
        end: Number(s.endDate),
      };
    case 'BusinessAwayMessageScheduleOutsideWorkHours':
      return { kind: 'outside' };
    default:
      return { kind: 'always' };
  }
};

const greetingOf = (g) =>
  g
    ? {
        shortcutId: Number(g.shortcutId),
        recipients: recipientsOf(g.recipients),
        noActivityDays: Number(g.noActivityDays),
      }
    : null;

const awayOf = (a) =>
  a
    ? {
        shortcutId: Number(a.shortcutId),
        recipients: recipientsOf(a.recipients),
        offlineOnly: Boolean(a.offlineOnly),
        schedule: scheduleOf(a.schedule),
      }
    : null;

const nameOf = (u) =>
  [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
  u?.username ||
  textOf(u?.id ?? '');

/** Whether `recipients` from the page is shaped as above. */
export const validRecipients = (r) =>
  Boolean(r) &&
  typeof r === 'object' &&
  FLAGS.every((k) => typeof r[k] === 'boolean') &&
  Array.isArray(r.users) &&
  r.users.length <= 100 &&
  r.users.every((u) => USER.test(String(u)));

/** Whether `schedule` from the page is shaped as above. */
export const validSchedule = (s) =>
  Boolean(s) &&
  SCHEDULES.includes(s.kind) &&
  (s.kind !== 'custom' ||
    (Number.isInteger(s.start) && Number.isInteger(s.end) && s.end > s.start));

const inputRecipients = async (c, r) => {
  const users = [];
  for (const id of r.users) {
    const peer = await c.client.getInputEntity(c.helpers.returnBigInt(id));
    users.push(
      new c.Api.InputUser({
        userId: peer.userId ?? c.helpers.returnBigInt(id),
        accessHash: peer.accessHash ?? c.zero,
      })
    );
  }
  return new c.Api.InputBusinessRecipients({
    ...Object.fromEntries(FLAGS.map((k) => [k, r[k] || undefined])),
    ...(users.length > 0 ? { users } : {}),
  });
};

const inputSchedule = (c, s) => {
  if (s.kind === 'custom') {
    return new c.Api.BusinessAwayMessageScheduleCustom({
      startDate: s.start,
      endDate: s.end,
    });
  }
  return s.kind === 'outside'
    ? new c.Api.BusinessAwayMessageScheduleOutsideWorkHours()
    : new c.Api.BusinessAwayMessageScheduleAlways();
};

export const createBusinessMessages = (env, { userClient }) => {
  const act = (key, use) =>
    connected(env, userClient, quickFailure, (c) =>
      runIn(env, `business-messages:${key}`, () => use(c))
    );

  const read = (c) =>
    c.client
      .invoke(new c.Api.users.GetFullUser({ id: new c.Api.InputUserSelf() }))
      .then(async (answer) => {
        const full = answer?.fullUser ?? {};
        const quick = await c.client.invoke(
          new c.Api.messages.GetQuickReplies({ hash: c.zero })
        );
        return { answer, full, quick };
      });

  const people = (answer, ...lists) => {
    const wanted = new Set(lists.flat());
    return (answer?.users ?? [])
      .filter((u) => wanted.has(textOf(u.id)))
      .map((u) => ({ id: textOf(u.id), name: nameOf(u) }));
  };

  const save = (key, enabled, build) =>
    act(key, async (c) => {
      await c.client.invoke(
        key === 'greeting'
          ? new c.Api.account.UpdateBusinessGreetingMessage(
              enabled ? { message: await build(c) } : {}
            )
          : new c.Api.account.UpdateBusinessAwayMessage(
              enabled ? { message: await build(c) } : {}
            )
      );
      return { ok: true };
    });

  return {
    businessMessages: () =>
      act('read', async (c) => {
        const { answer, full, quick } = await read(c);
        const greeting = greetingOf(full.businessGreetingMessage);
        const away = awayOf(full.businessAwayMessage);
        return {
          ok: true,
          greeting,
          away,
          shortcuts: (quick?.quickReplies ?? []).map((q) => ({
            id: Number(q.shortcutId),
            name: String(q.shortcut),
          })),
          people: people(
            answer,
            greeting?.recipients.users ?? [],
            away?.recipients.users ?? []
          ),
        };
      }),
    businessGreetingSave: async (body = {}) => {
      if (body.enabled !== true) {
        return body.enabled === false
          ? save('greeting', false)
          : bad('bad-request');
      }
      if (
        !ID.test(String(body.shortcutId)) ||
        !validRecipients(body.recipients) ||
        !DAYS.includes(body.noActivityDays)
      ) {
        return bad('bad-request');
      }
      return save(
        'greeting',
        true,
        async (c) =>
          new c.Api.InputBusinessGreetingMessage({
            shortcutId: Number(body.shortcutId),
            recipients: await inputRecipients(c, body.recipients),
            noActivityDays: body.noActivityDays,
          })
      );
    },
    businessAwaySave: async (body = {}) => {
      if (body.enabled !== true) {
        return body.enabled === false
          ? save('away', false)
          : bad('bad-request');
      }
      if (
        !ID.test(String(body.shortcutId)) ||
        !validRecipients(body.recipients) ||
        !validSchedule(body.schedule) ||
        typeof body.offlineOnly !== 'boolean'
      ) {
        return bad('bad-request');
      }
      return save(
        'away',
        true,
        async (c) =>
          new c.Api.InputBusinessAwayMessage({
            offlineOnly: body.offlineOnly || undefined,
            shortcutId: Number(body.shortcutId),
            schedule: inputSchedule(c, body.schedule),
            recipients: await inputRecipients(c, body.recipients),
          })
      );
    },
  };
};
