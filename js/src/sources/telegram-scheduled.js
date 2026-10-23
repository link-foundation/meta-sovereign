/**
 * Scheduled messages, as Telegram's apps keep them (R-Y102; Telegram
 * Desktop's "Schedule message" and its scheduled messages section,
 * learned, never copied).
 *
 * A message sent with a `schedule_date` is not in the chat: Telegram
 * holds it and sends it then (the chat gets it as a new message). The
 * chat's scheduled ones are listed apart:
 *
 * - `scheduledList({ chat })` — messages.getScheduledHistory, as links
 *   (`sched:telegram:<chat>:<id>`, the time it goes as their time), the
 *   soonest first. Kept a little while, so opening a chat again does not
 *   ask again; anything done to them here asks afresh.
 * - `scheduledSendNow({ chat, ids })` — messages.sendScheduledMessages:
 *   sent at once (they come into the chat as new messages).
 * - `scheduledDelete({ chat, ids })` — messages.deleteScheduledMessages.
 * - `scheduledReschedule({ chat, id, date })` — messages.editMessage with
 *   a new schedule_date.
 *
 * "Send when online" (R-Y197): `schedule_date` 0x7FFFFFFE, which
 * Telegram's clients use for a message held until the other person is
 * next online; the list shows it as "When online", not as a date.
 */

const SOURCE = 'telegram';
const KEEP_MS = 30_000;
export const MAX_SCHEDULED_IDS = 100;
// Telegram takes a time from a few seconds to a year ahead.
export const MIN_AHEAD_S = 10;
export const MAX_AHEAD_S = 366 * 86_400;

/** The `schedule_date` of a message held until the person is online. */
export const WHEN_ONLINE = 0x7f_ff_ff_fe;

/** Whether `date` (unix seconds) is a time Telegram schedules for. */
export const validSchedule = (date, nowS = Math.floor(Date.now() / 1000)) =>
  date === WHEN_ONLINE ||
  (Number.isInteger(date) &&
    date >= nowS + MIN_AHEAD_S &&
    date <= nowS + MAX_AHEAD_S);

export const scheduledId = (chat, id) => `sched:${SOURCE}:${chat}:${id}`;

/**
 * `env` is the account's; `userClient()` the connected user client or
 * null; `apply(client, result)` takes Telegram's answer through the live
 * handler; `dialogOf(chat)` the chat as listed; `tools.toLinks` turns
 * messages into links.
 */
export const createScheduled = (
  env,
  { userClient, apply, dialogOf, tools },
  { now = () => Date.now() } = {}
) => {
  const kept = new Map(); // chat -> { at, links }

  const ask = async (chat, use) => {
    const client = chat ? await userClient() : null;
    if (!client) {
      return null;
    }
    const { Api } = await env.importer();
    return env.connection.withPeer(client, String(chat), (peer) =>
      use({ client, Api, peer })
    );
  };

  const toScheduled = async (chat, messages) => {
    const links = tools.toLinks(await dialogOf(chat), messages);
    return links
      .map((link) => ({
        ...link,
        id: scheduledId(chat, link.id.split(':').pop()),
        scheduled: true,
      }))
      .sort((a, b) => String(a.timestamp).localeCompare(b.timestamp));
  };

  const scheduledList = async ({ chat, fresh = false } = {}) => {
    const target = String(chat ?? '');
    const known = kept.get(target);
    if (!fresh && known && now() - known.at < KEEP_MS) {
      return { ok: true, chat: target, links: known.links };
    }
    const answer = await ask(target, ({ client, Api, peer }) =>
      client.invoke(new Api.messages.GetScheduledHistory({ peer, hash: 0 }))
    );
    if (!answer) {
      return { ok: false, supported: false };
    }
    const messages = (answer.messages ?? []).filter(
      (m) => m && m.className !== 'MessageEmpty'
    );
    const links = await toScheduled(target, messages);
    kept.set(target, { at: now(), links });
    return { ok: true, chat: target, links };
  };

  // A change to the chat's scheduled ones: Telegram's answer through the
  // live handler, and the list asked afresh.
  const change = async (chat, use) => {
    const target = String(chat ?? '');
    let client = null;
    const result = await ask(target, (context) => {
      client = context.client;
      return use(context);
    });
    if (!client) {
      return { ok: false, supported: false };
    }
    if (result && typeof result === 'object') {
      await apply(client, result);
    }
    kept.delete(target);
    return { ok: true, chat: target };
  };

  const idsOf = (ids) =>
    (Array.isArray(ids) ? ids : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, MAX_SCHEDULED_IDS);

  const scheduledSendNow = ({ chat, ids } = {}) =>
    change(chat, ({ client, Api, peer }) =>
      client.invoke(
        new Api.messages.SendScheduledMessages({ peer, id: idsOf(ids) })
      )
    );

  const scheduledDelete = ({ chat, ids } = {}) =>
    change(chat, ({ client, Api, peer }) =>
      client.invoke(
        new Api.messages.DeleteScheduledMessages({ peer, id: idsOf(ids) })
      )
    );

  const scheduledReschedule = ({ chat, id, date } = {}) =>
    change(chat, ({ client, Api, peer }) =>
      client.invoke(
        new Api.messages.EditMessage({
          peer,
          id: Number(id),
          scheduleDate: date,
        })
      )
    );

  /** Forget what is kept for `chat` (a message was just scheduled). */
  const scheduledChanged = (chat) => {
    kept.delete(String(chat));
  };

  return {
    scheduledList,
    scheduledSendNow,
    scheduledDelete,
    scheduledReschedule,
    scheduledChanged,
  };
};
