/**
 * Emoji statuses, as Telegram Desktop and the mobile apps have them
 * (R-Y162; learned, never copied): a Premium account shows a custom emoji
 * after its name, for a while or until it changes it.
 * - `emojiStatuses()` → `{ ok, premium, current, defaults, recent }`:
 *   account.getDefaultEmojiStatuses and account.getRecentEmojiStatuses
 *   (hash 0); `current` is the account's own status, each status
 *   `{ id, until? }` with `id` the custom emoji's document id as a
 *   decimal string and `until` Unix seconds.
 * - `emojiStatusSet({ documentId|null, until? })` — account.updateEmojiStatus
 *   with EmojiStatus{documentId, until} or EmojiStatusEmpty (null removes
 *   it). Setting one is Premium-only: Telegram's refusal is the code
 *   `premium`.
 * - `statusOf(value)` is the status a user or channel entity carries (a
 *   collectible one by its emoji), `statusFields(entity, prefix)` its flat
 *   fields on a stored link, for the chat list and the messages.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  EMOJI_STATUS_INVALID: 'invalid',
  DOCUMENT_INVALID: 'invalid',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

/** A document id as the server takes it: a decimal string of a long. */
export const DOCUMENT_ID = /^\d{1,20}$/;
export const MAX_UNTIL_SECONDS = 366 * 24 * 3600;

const text = (value) => String(value?.value ?? value);

/** `{ id, until? }` of an EmojiStatus (or a collectible), else null. */
export const statusOf = (value) => {
  const id = value?.documentId;
  if (id === undefined || id === null) {
    return null;
  }
  const until = Number(value.until);
  return {
    id: text(id),
    ...(Number.isFinite(until) && until > 0 ? { until } : {}),
  };
};

/**
 * The flat fields a stored link keeps for an entity's status: strings
 * and numbers compare with `!==`, so a re-sync rewrites only a changed
 * one. `prefix` is `senderEmoji` or `emoji`: `<prefix>Status`/`Until`.
 * A user seen without a status clears the stored one (null); an entity
 * that is not there says nothing.
 */
export const statusFields = (entity, prefix) => {
  if (!entity || typeof entity !== 'object') {
    return {};
  }
  const status = statusOf(entity.emojiStatus);
  return {
    [`${prefix}Status`]: status?.id ?? null,
    [`${prefix}Until`]: status?.until ?? null,
  };
};

const listOf = (answer) =>
  (answer?.statuses ?? []).map(statusOf).filter(Boolean);

export const createEmojiStatus = (env, { userClient }) => {
  const now = () => (env.now ?? Date.now)();

  const emojiStatuses = async () =>
    connected(env, userClient, failure, async (c) => {
      const hash = c.helpers.returnBigInt('0');
      const ask = (name) =>
        runIn(env, `emoji-status:${name}`, () =>
          c.client.invoke(new c.Api.account[name]({ hash }))
        );
      const defaults = await ask('GetDefaultEmojiStatuses');
      const recent = await ask('GetRecentEmojiStatuses');
      const me = await c.client.getMe?.().catch(() => null);
      return {
        ok: true,
        premium: Boolean(me?.premium),
        current: statusOf(me?.emojiStatus),
        defaults: listOf(defaults),
        recent: listOf(recent),
      };
    });

  const emojiStatusSet = async ({ documentId = null, until } = {}) => {
    const seconds = now() / 1000;
    const badUntil =
      until !== undefined &&
      !(
        Number.isInteger(until) &&
        until > seconds &&
        until <= seconds + MAX_UNTIL_SECONDS
      );
    if (
      (documentId !== null && !DOCUMENT_ID.test(String(documentId))) ||
      badUntil
    ) {
      return { ok: false, error: 'invalid', code: 'invalid' };
    }
    return connected(env, userClient, failure, async (c) => {
      const status =
        documentId === null
          ? new c.Api.EmojiStatusEmpty()
          : new c.Api.EmojiStatus({
              documentId: c.helpers.returnBigInt(String(documentId)),
              ...(until === undefined ? {} : { until }),
            });
      await runIn(env, 'emoji-status:set', () =>
        c.client.invoke(
          new c.Api.account.UpdateEmojiStatus({ emojiStatus: status })
        )
      );
      return { ok: true };
    });
  };

  return { emojiStatuses, emojiStatusSet };
};
