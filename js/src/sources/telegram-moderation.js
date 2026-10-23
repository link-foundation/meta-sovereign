/**
 * Moderating a supergroup's members, as Telegram
 * Desktop's admin dialogs do (R-Y200; learned, never copied):
 * - `moderateUser({ chat, user, ids?, reportSpam?, ban?, deleteAll? })` —
 *   what the delete dialog's checkboxes ask: "Report spam" for the
 *   message ids (channels.reportSpam, first, while they still exist),
 *   "Ban user" (channels.editBanned, view messages off for good) and
 *   "Delete all from <name>" (channels.deleteParticipantHistory, asked
 *   again while Telegram's AffectedHistory says an `offset` is left) →
 *   `{ ok, deleted }`; supergroups only;
 * - `notSpam({ chat, msgId })` — "Not spam" for a message anti-spam
 *   deleted (channels.reportAntiSpamFalsePositive);
 * Telegram's errors become codes the page shows as text.
 */

import { inputPeerOf } from './telegram-members.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  USER_ADMIN_INVALID: 'user-admin',
  USER_NOT_PARTICIPANT: 'not-member',
  PARTICIPANT_ID_INVALID: 'not-member',
  MESSAGE_ID_INVALID: 'no-message',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  USER_ID_INVALID: 'not-member',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const bad = () => ({ ok: false, error: 'bad-request', code: 'bad-request' });

const CHANNEL = /^-100\d{1,20}$/;
const USER = /^\d{1,20}$/;
const MSG = /^\d{1,12}$/;
const MAX_ROUNDS = 50;
const MAX_IDS = 100;

const idsOk = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= MAX_IDS &&
  value.every((id) => Number.isInteger(id) && id > 0);

/** Whether `body` is a valid moderateUser request. */
export const moderationBody = (body = {}) =>
  CHANNEL.test(String(body.chat ?? '')) &&
  USER.test(String(body.user ?? '')) &&
  ['reportSpam', 'ban', 'deleteAll'].every(
    (k) => body[k] === undefined || typeof body[k] === 'boolean'
  ) &&
  (body.ids === undefined || idsOk(body.ids)) &&
  // Reporting needs the messages; at least one thing must be asked.
  (!body.reportSpam || body.ids !== undefined) &&
  Boolean(body.reportSpam || body.ban || body.deleteAll);

// Asked again while Telegram says more is left of the person's messages.
const clearHistory = async (env, c, chat, participant) => {
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const answer = await runIn(env, `moderate:all:${chat}:${round}`, () =>
      env.connection.withPeer(c.client, chat, (peer) =>
        c.client.invoke(
          new c.Api.channels.DeleteParticipantHistory({
            channel: peer,
            participant,
          })
        )
      )
    );
    if (!Number(answer?.offset)) {
      return;
    }
  }
};

const createModerate =
  (env, userClient) =>
  async (body = {}) => {
    if (!moderationBody(body)) {
      return bad();
    }
    const chat = String(body.chat);
    return connected(env, userClient, failure, async (c) => {
      const participant = await inputPeerOf(c, String(body.user));
      const through = (key, make) =>
        runIn(env, `moderate:${key}:${chat}:${body.user}`, () =>
          env.connection.withPeer(c.client, chat, (peer) =>
            c.client.invoke(make(peer))
          )
        );
      // The report first: it needs the messages to still be there.
      if (body.reportSpam) {
        await through(
          'spam',
          (channel) =>
            new c.Api.channels.ReportSpam({
              channel,
              participant,
              id: body.ids,
            })
        );
      }
      if (body.ban) {
        await through(
          'ban',
          (channel) =>
            new c.Api.channels.EditBanned({
              channel,
              participant,
              bannedRights: new c.Api.ChatBannedRights({
                viewMessages: true,
                untilDate: 0,
              }),
            })
        );
      }
      if (body.deleteAll) {
        await clearHistory(env, c, chat, participant);
      }
      return { ok: true, deleted: Boolean(body.deleteAll) };
    });
  };

const createNotSpam =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const msgId = String(body.msgId ?? '');
    if (!CHANNEL.test(chat) || !MSG.test(msgId)) {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `antispam:${chat}:${msgId}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.channels.ReportAntiSpamFalsePositive({
              channel: peer,
              msgId: Number(msgId),
            })
          )
        )
      );
      return { ok: true };
    });
  };

export const createModeration = (env, context) => ({
  moderateUser: createModerate(env, context.userClient),
  notSpam: createNotSpam(env, context.userClient),
});
