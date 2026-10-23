/**
 * Four small account features, as Telegram Desktop has them (R-Y174;
 * learned, never copied):
 * - `archiveSettings()` — account.getGlobalPrivacySettings → `{ ok,
 *   settings: { archiveAndMute, keepUnmuted, keepFolders, hideReadMarks,
 *   requirePremium } }`;
 * - `setArchiveSettings({ ...those five booleans })` —
 *   account.setGlobalPrivacySettings with the settings read again and
 *   only these five changed, so the fields the page does not show (gifts
 *   button, paid messages price, disallowed gifts) are kept;
 * - `webSessions()` — account.getWebAuthorizations → `{ ok, sessions:
 *   [{ hash, domain, bot, browser, platform, ip, region, created,
 *   active }] }`; `webSessionReset({ hash })` —
 *   account.resetWebAuthorization; `webSessionsResetAll()` —
 *   account.resetWebAuthorizations;
 * - `savedPin({ peer, pinned })` — messages.toggleSavedDialogPin, a
 *   chat of Saved Messages pinned or unpinned.
 * Telegram's errors become codes the page shows as text
 * (PREMIUM_ACCOUNT_REQUIRED → `premium-required`).
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

export const ARCHIVE_FIELDS = {
  archiveAndMute: 'archiveAndMuteNewNoncontactPeers',
  keepUnmuted: 'keepArchivedUnmuted',
  keepFolders: 'keepArchivedFolders',
  hideReadMarks: 'hideReadMarks',
  requirePremium: 'newNoncontactPeersRequirePremium',
};
// The fields of GlobalPrivacySettings this page does not show.
const KEPT_FIELDS = [
  'displayGiftsButton',
  'noncontactPeersPaidStars',
  'disallowedGifts',
];

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium-required',
  HASH_INVALID: 'hash-invalid',
  PEER_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const bad = { ok: false, error: 'bad request', code: 'bad-request' };
const CHAT = /^-?\d{1,20}$/;
const HASH = /^-?\d{1,20}$/;
const text = (value) => String(value?.value ?? value ?? '');

/** The page's five switches from Telegram's GlobalPrivacySettings. */
export const settingsOf = (answer) =>
  Object.fromEntries(
    Object.entries(ARCHIVE_FIELDS).map(([key, field]) => [
      key,
      Boolean(answer?.[field]),
    ])
  );

const validSettings = (request) =>
  Object.keys(ARCHIVE_FIELDS).every(
    (key) => typeof request?.[key] === 'boolean'
  );

const iso = (seconds) =>
  Number(seconds) > 0 ? new Date(Number(seconds) * 1000).toISOString() : null;

const botName = (user) =>
  user?.firstName || user?.username || (user ? text(user.id) : '');

/** A WebAuthorization as the page lists it. */
export const webSessionOf = (a, users) => {
  const bot = users.get(text(a.botId));
  return {
    hash: text(a.hash),
    domain: a.domain ?? '',
    bot: botName(bot),
    botUsername: bot?.username ?? '',
    browser: a.browser ?? '',
    platform: a.platform ?? '',
    ip: a.ip ?? '',
    region: a.region ?? '',
    created: iso(a.dateCreated),
    active: iso(a.dateActive),
  };
};

export const createAccountExtras = (env, { userClient }) => {
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));

  const archiveSettings = async () =>
    doing('archive-settings', async (c) => {
      const answer = await c.client.invoke(
        new c.Api.account.GetGlobalPrivacySettings()
      );
      return { ok: true, settings: settingsOf(answer) };
    });

  const setArchiveSettings = async (request = {}) => {
    if (!validSettings(request)) {
      return bad;
    }
    return doing('archive-settings', async (c) => {
      const now = await c.client.invoke(
        new c.Api.account.GetGlobalPrivacySettings()
      );
      const fields = {};
      for (const name of KEPT_FIELDS) {
        if (now?.[name] !== undefined) {
          fields[name] = now[name];
        }
      }
      for (const [key, field] of Object.entries(ARCHIVE_FIELDS)) {
        fields[field] = request[key];
      }
      const next = await c.client.invoke(
        new c.Api.account.SetGlobalPrivacySettings({
          settings: new c.Api.GlobalPrivacySettings(fields),
        })
      );
      return { ok: true, settings: settingsOf(next ?? fields) };
    });
  };

  const webSessions = async () =>
    doing('web-sessions', async (c) => {
      const answer = await c.client.invoke(
        new c.Api.account.GetWebAuthorizations()
      );
      const users = new Map((answer?.users ?? []).map((u) => [text(u.id), u]));
      return {
        ok: true,
        sessions: (answer?.authorizations ?? []).map((a) =>
          webSessionOf(a, users)
        ),
      };
    });

  const webSessionReset = async ({ hash } = {}) =>
    !HASH.test(String(hash ?? ''))
      ? bad
      : doing('web-sessions', async (c) => {
          await c.client.invoke(
            new c.Api.account.ResetWebAuthorization({
              hash: c.helpers.returnBigInt(String(hash)),
            })
          );
          return { ok: true };
        });

  const webSessionsResetAll = async () =>
    doing('web-sessions', async (c) => {
      await c.client.invoke(new c.Api.account.ResetWebAuthorizations());
      return { ok: true };
    });

  const savedPin = async ({ peer, pinned } = {}) =>
    !CHAT.test(String(peer ?? '')) || typeof pinned !== 'boolean'
      ? bad
      : doing('saved-pin', (c) =>
          env.connection.withPeer(c.client, String(peer), async (input) => {
            await c.client.invoke(
              new c.Api.messages.ToggleSavedDialogPin({
                ...(pinned ? { pinned: true } : {}),
                peer: new c.Api.InputDialogPeer({ peer: input }),
              })
            );
            return { ok: true, pinned };
          })
        );

  return {
    archiveSettings,
    setArchiveSettings,
    webSessions,
    webSessionReset,
    webSessionsResetAll,
    savedPin,
  };
};
