/**
 * Paid messages, as Telegram Desktop has them (R-Y184; learned, never
 * copied): a person or a group may charge Stars per message.
 * - `paidPrice({ chat })` — what one message costs the user in `chat`:
 *   a person's price from users.getRequirementsToContact, a supergroup's
 *   from its `send_paid_messages_stars` (channels.getChannels; an owner or
 *   admin writes free) → `{ ok, stars }` (0: free). Read only;
 * - `paidSettings()` — account.getGlobalPrivacySettings → `{ ok, stars }`,
 *   the price the user charges non-contacts (0: nobody is charged);
 * - `paidSettingsSave({ stars })` — account.setGlobalPrivacySettings with
 *   `noncontact_peers_paid_stars` = stars (0 removes it) and every other
 *   setting KEPT as read (a WRITE, on Save only), 0..PAID_STARS_MAX;
 * - `paidRevenue({ user })` — account.getPaidMessagesRevenue → `{ ok,
 *   stars }` earned from one person (read only);
 * - `paidException({ user, allow, refund })` — account.
 *   toggleNoPaidMessagesException: `allow` lets the person write for free
 *   (optionally refunding what they paid), otherwise they pay again (a
 *   WRITE, on a confirmation only);
 * - `paidPriceSave({ chat, stars })` — channels.updatePaidMessagesPrice for
 *   a group the user admins, 0 turns it off (a WRITE, on Save only).
 * Sending into such a chat is not here: a send carries the Stars the user
 * confirmed (`allowPaidStars`, telegram-send-as-client.js). Telegram's
 * errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

export const PAID_STARS_MAX = 10_000;

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  STARS_AMOUNT_INVALID: 'bad-price',
  PAID_MESSAGE_STARS_INVALID: 'bad-price',
  USER_ID_INVALID: 'no-user',
  PEER_ID_INVALID: 'no-chat',
  CHANNEL_INVALID: 'no-chat',
  CHANNEL_PRIVATE: 'no-chat',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'bad-request' };
const USER = /^\d{1,20}$/;
const CHANNEL = /^-100\d{1,20}$/;
const whole = (n) => Number(n?.value ?? n ?? 0) || 0;

/** Whether `stars` is a whole price from 0 to the most Telegram takes. */
export const validPrice = (stars) =>
  Number.isInteger(stars) && stars >= 0 && stars <= PAID_STARS_MAX;

// The Stars a person asks, from users.getRequirementsToContact's answer.
const personStars = (answer) => {
  const one = Array.isArray(answer) ? answer[0] : null;
  return one?.className === 'RequirementToContactPaidMessages'
    ? whole(one.starsAmount)
    : 0;
};

// A group's price for this user: admins and the owner write free.
const groupStars = (answer) => {
  const channel = (answer?.chats ?? [])[0];
  if (!channel || channel.creator || channel.adminRights) {
    return 0;
  }
  return whole(channel.sendPaidMessagesStars);
};

const price = (env, userClient) => async (body) => {
  const chat = String(body?.chat ?? '');
  if (!USER.test(chat) && !CHANNEL.test(chat)) {
    // A basic group never charges.
    return /^-\d{1,20}$/.test(chat) ? { ok: true, stars: 0 } : BAD;
  }
  return connected(env, userClient, failure, async (c) => {
    const person = USER.test(chat);
    const answer = await runIn(env, `paid:price:${chat}`, () =>
      env.connection.withPeer(c.client, chat, (peer) =>
        c.client.invoke(
          person
            ? new c.Api.users.GetRequirementsToContact({ id: [peer] })
            : new c.Api.channels.GetChannels({ id: [peer] })
        )
      )
    );
    return {
      ok: true,
      stars: person ? personStars(answer) : groupStars(answer),
    };
  });
};

// The settings as Telegram has them, to be set again with one changed.
const KEPT = [
  'archiveAndMuteNewNoncontactPeers',
  'keepArchivedUnmuted',
  'keepArchivedFolders',
  'hideReadMarks',
  'newNoncontactPeersRequirePremium',
  'displayGiftsButton',
  'disallowedGifts',
];

const settingsWith = (c, current, stars) =>
  new c.Api.GlobalPrivacySettings({
    ...Object.fromEntries(
      KEPT.filter(
        (k) => current?.[k] !== undefined && current[k] !== false
      ).map((k) => [k, current[k]])
    ),
    ...(stars > 0 ? { noncontactPeersPaidStars: stars } : {}),
  });

const settings = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const current = await runIn(env, 'paid:settings', () =>
      c.client.invoke(new c.Api.account.GetGlobalPrivacySettings())
    );
    return { ok: true, stars: whole(current?.noncontactPeersPaidStars) };
  });

const settingsSave =
  (env, userClient) =>
  async ({ stars } = {}) =>
    !validPrice(stars)
      ? BAD
      : connected(env, userClient, failure, async (c) => {
          const current = await runIn(env, 'paid:settings', () =>
            c.client.invoke(new c.Api.account.GetGlobalPrivacySettings())
          );
          await runIn(env, 'paid:settings', () =>
            c.client.invoke(
              new c.Api.account.SetGlobalPrivacySettings({
                settings: settingsWith(c, current, stars),
              })
            )
          );
          return { ok: true, stars };
        });

const revenue =
  (env, userClient) =>
  async ({ user } = {}) =>
    !USER.test(String(user ?? ''))
      ? BAD
      : connected(env, userClient, failure, async (c) => {
          const answer = await runIn(env, `paid:revenue:${user}`, () =>
            env.connection.withPeer(c.client, String(user), (peer) =>
              c.client.invoke(
                new c.Api.account.GetPaidMessagesRevenue({ userId: peer })
              )
            )
          );
          return { ok: true, stars: whole(answer?.starsAmount) };
        });

const exception =
  (env, userClient) =>
  async ({ user, allow, refund } = {}) =>
    !USER.test(String(user ?? '')) || typeof allow !== 'boolean'
      ? BAD
      : connected(env, userClient, failure, async (c) => {
          await runIn(env, `paid:exception:${user}`, () =>
            env.connection.withPeer(c.client, String(user), (peer) =>
              c.client.invoke(
                new c.Api.account.ToggleNoPaidMessagesException({
                  userId: peer,
                  ...(allow
                    ? refund === true
                      ? { refundCharged: true }
                      : {}
                    : { requirePayment: true }),
                })
              )
            )
          );
          return { ok: true, allow };
        });

const priceSave =
  (env, userClient) =>
  async ({ chat, stars } = {}) =>
    !CHANNEL.test(String(chat ?? '')) || !validPrice(stars)
      ? BAD
      : connected(env, userClient, failure, async (c) => {
          await runIn(env, `paid:price-save:${chat}`, () =>
            env.connection.withPeer(c.client, String(chat), (channel) =>
              c.client.invoke(
                new c.Api.channels.UpdatePaidMessagesPrice({
                  channel,
                  sendPaidMessagesStars: stars,
                })
              )
            )
          );
          return { ok: true, stars };
        });

export const createPaidMessages = (env, { userClient }) => ({
  paidPrice: price(env, userClient),
  paidSettings: settings(env, userClient),
  paidSettingsSave: settingsSave(env, userClient),
  paidRevenue: revenue(env, userClient),
  paidException: exception(env, userClient),
  paidPriceSave: priceSave(env, userClient),
});
