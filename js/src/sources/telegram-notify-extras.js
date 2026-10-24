/**
 * Reaction notifications, resetting the notification settings and
 * Telegram's own automatic-download preset (R-Y215; learned, never
 * copied):
 *
 * - `reactionNotifyGet()` — account.getReactionsNotifySettings → `{ ok,
 *   messages, stories, previews, sound }`: who the account is told of
 *   reactions to its messages and stories from ('nobody', 'contacts' or
 *   'all'), whether the notification shows a preview and whether it has a
 *   sound;
 * - `reactionNotifySet({ messages?, stories?, previews?, sound? })` —
 *   account.setReactionsNotifySettings with the rest kept as it was (the
 *   poll votes setting, a chosen ringtone) → the same row;
 * - `notifyResetAll()` — account.resetNotifySettings: every notification
 *   setting back to Telegram's default;
 * - `autoDownloadPreset()` — account.getAutoDownloadSettings → `{ ok,
 *   medium: { disabled, photoMax, videoMax, fileMax } }` (bytes), the
 *   preset the page maps to its own settings.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

const failure = failureOf({ FLOOD_WAIT: 'flood' });
const BAD = { ok: false, error: 'bad request', code: 'bad-request' };

export const FROM = Object.freeze(['nobody', 'contacts', 'all']);
const FROM_CLASS = {
  contacts: 'ReactionNotificationsFromContacts',
  all: 'ReactionNotificationsFromAll',
};

/** 'nobody', 'contacts' or 'all' from Telegram's ReactionNotificationsFrom. */
export const fromOf = (value) => {
  if (value?.className === FROM_CLASS.contacts) {
    return 'contacts';
  }
  return value?.className === FROM_CLASS.all ? 'all' : 'nobody';
};

/** The page's row from Telegram's ReactionsNotifySettings. */
export const reactionRowOf = (settings = {}) => ({
  messages: fromOf(settings.messagesNotifyFrom),
  stories: fromOf(settings.storiesNotifyFrom),
  previews: settings.showPreviews !== false,
  sound: settings.sound?.className !== 'NotificationSoundNone',
});

export const validReactionChange = (b = {}) =>
  (b.messages === undefined || FROM.includes(b.messages)) &&
  (b.stories === undefined || FROM.includes(b.stories)) &&
  (b.previews === undefined || typeof b.previews === 'boolean') &&
  (b.sound === undefined || typeof b.sound === 'boolean') &&
  (b.messages !== undefined ||
    b.stories !== undefined ||
    b.previews !== undefined ||
    b.sound !== undefined);

const fromInput = (c, value, kept) => {
  if (value === undefined) {
    return kept;
  }
  return value === 'nobody' ? undefined : new c.Api[FROM_CLASS[value]]();
};

// The settings to write: what Telegram has, with the page's changes.
const reactionFields = (c, current, body) => {
  const fields = {
    showPreviews: body.previews ?? current.showPreviews !== false,
    sound: current.sound ?? new c.Api.NotificationSoundDefault(),
  };
  if (body.sound !== undefined) {
    fields.sound = body.sound
      ? new c.Api.NotificationSoundDefault()
      : new c.Api.NotificationSoundNone();
  }
  const entries = {
    messagesNotifyFrom: fromInput(c, body.messages, current.messagesNotifyFrom),
    storiesNotifyFrom: fromInput(c, body.stories, current.storiesNotifyFrom),
    pollVotesNotifyFrom: current.pollVotesNotifyFrom,
  };
  for (const [key, value] of Object.entries(entries)) {
    if (value) {
      fields[key] = value;
    }
  }
  return fields;
};

const sizeOf = (value) => Number(value?.value ?? value ?? 0) || 0;

/** The page's view of Telegram's AutoDownloadSettings (sizes in bytes). */
export const presetOf = (settings = {}) => ({
  disabled: settings.disabled === true,
  photoMax: sizeOf(settings.photoSizeMax),
  videoMax: sizeOf(settings.videoSizeMax),
  fileMax: sizeOf(settings.fileSizeMax),
});

export const createNotifyExtras = (env, { userClient }) => ({
  reactionNotifyGet: async () =>
    connected(env, userClient, failure, (c) =>
      runIn(env, 'reaction-notify', async () => ({
        ok: true,
        ...reactionRowOf(
          await c.client.invoke(new c.Api.account.GetReactionsNotifySettings())
        ),
      }))
    ),
  reactionNotifySet: async (body = {}) =>
    validReactionChange(body)
      ? connected(env, userClient, failure, (c) =>
          runIn(env, 'reaction-notify', async () => {
            const current =
              (await c.client.invoke(
                new c.Api.account.GetReactionsNotifySettings()
              )) ?? {};
            const fields = reactionFields(c, current, body);
            await c.client.invoke(
              new c.Api.account.SetReactionsNotifySettings({
                settings: new c.Api.ReactionsNotifySettings(fields),
              })
            );
            return { ok: true, ...reactionRowOf(fields) };
          })
        )
      : BAD,
  notifyResetAll: async () =>
    connected(env, userClient, failure, (c) =>
      runIn(env, 'notify-reset', async () => {
        await c.client.invoke(new c.Api.account.ResetNotifySettings());
        return { ok: true };
      })
    ),
  autoDownloadPreset: async () =>
    connected(env, userClient, failure, (c) =>
      runIn(env, 'auto-download-preset', async () => {
        const all = await c.client.invoke(
          new c.Api.account.GetAutoDownloadSettings()
        );
        return { ok: true, medium: presetOf(all?.medium) };
      })
    ),
});
