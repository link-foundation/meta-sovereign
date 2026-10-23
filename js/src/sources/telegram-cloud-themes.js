/**
 * Cloud themes and the per-chat translation switch, as Telegram Desktop has
 * them (R-Y209; learned, never copied):
 * - `cloudThemes({ fresh })` — the themes of the account and Telegram's
 *   (account.getThemes in Desktop's 'tdesktop' format, asked again with the
 *   hash it gave) as `{ ok, themes: [cloudPage] }`;
 * - `cloudTheme({ slug })` — one theme by its t.me/addtheme slug
 *   (account.getTheme with InputThemeSlug) as `{ ok, theme }`;
 * - `installCloudTheme({ id, accessHash, slug, dark, reset })` — records the
 *   theme as the account's (account.installTheme), or with `reset` puts the
 *   default back; the page applies the colours on its own;
 * - `toggleTranslations({ chat, disabled })` — "Do not translate this chat"
 *   or the offer back (messages.togglePeerTranslations).
 * A theme's page form keeps the colours of its ThemeSettings only (the
 * `{ base, accent, outgoing, messages }` of chat themes, light and dark);
 * the .tdesktop-theme file is never parsed.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { settingsPage } from './telegram-chat-themes.js';

const CODES = {
  THEME_INVALID: 'not-found',
  THEME_SLUG_INVALID: 'not-found',
  THEME_FORMAT_INVALID: 'invalid',
  CHAT_ID_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

export const SLUG = /^[A-Za-z0-9_-]{1,64}$/;
export const DIGITS = /^\d{1,20}$/;
export const CHAT = /^-?\d{1,20}$/;
const FORMAT = 'tdesktop';
const LIST_MS = 5 * 60_000;
const DARK_BASES = ['BaseThemeNight', 'BaseThemeTinted'];

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

/** A Theme as the page keeps it, or null for anything else. */
export const cloudPage = (theme) => {
  if (theme?.className !== 'Theme' || !theme.slug) {
    return null;
  }
  const all = theme.settings ?? [];
  const dark = all.find((s) => DARK_BASES.includes(s.baseTheme?.className));
  const light = all.find((s) => s !== dark);
  return {
    id: text(theme.id),
    accessHash: text(theme.accessHash),
    slug: String(theme.slug),
    title: String(theme.title ?? ''),
    creator: Boolean(theme.creator),
    default: Boolean(theme.default),
    forChat: Boolean(theme.forChat),
    light: settingsPage(light),
    dark: settingsPage(dark),
  };
};

export const createCloudThemes = (env, { userClient }) => {
  let kept = null; // { at, hash, answer }

  const cloudThemes = async ({ fresh = false } = {}) => {
    if (!fresh && kept && Date.now() - kept.at < LIST_MS) {
      return kept.answer;
    }
    return connected(env, userClient, failure, async (c) => {
      const got = await runIn(env, 'cloud-themes:list', () =>
        c.client.invoke(
          new c.Api.account.GetThemes({
            format: FORMAT,
            hash: kept && !fresh ? c.helpers.returnBigInt(kept.hash) : c.zero,
          })
        )
      );
      if (got?.className === 'account.ThemesNotModified' && kept) {
        kept.at = Date.now();
        return kept.answer;
      }
      const themes = (got?.themes ?? []).map(cloudPage).filter(Boolean);
      const answer = { ok: true, themes };
      kept = { at: Date.now(), hash: text(got?.hash) || '0', answer };
      return answer;
    });
  };

  const cloudTheme = async ({ slug } = {}) => {
    if (!SLUG.test(String(slug ?? ''))) {
      return { ok: false, error: 'bad slug', code: 'bad-request' };
    }
    return connected(env, userClient, failure, async (c) => {
      const got = await runIn(env, `cloud-theme:${slug}`, () =>
        c.client.invoke(
          new c.Api.account.GetTheme({
            format: FORMAT,
            theme: new c.Api.InputThemeSlug({ slug }),
          })
        )
      );
      const theme = cloudPage(got);
      return theme ? { ok: true, theme } : { ok: false, code: 'not-found' };
    });
  };

  const inputOf = (c, { id, accessHash, slug }) =>
    slug
      ? new c.Api.InputThemeSlug({ slug })
      : new c.Api.InputTheme({
          id: c.helpers.returnBigInt(id),
          accessHash: c.helpers.returnBigInt(accessHash),
        });

  // The one account write for themes: the theme recorded, or the default.
  const installCloudTheme = async (body = {}) => {
    const { id, accessHash, slug, dark = false, reset = false } = body;
    const named = DIGITS.test(String(id ?? '')) && DIGITS.test(accessHash);
    if (!reset && !named && !SLUG.test(String(slug ?? ''))) {
      return { ok: false, error: 'bad theme', code: 'bad-request' };
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, 'cloud-theme:install', () =>
        c.client.invoke(
          new c.Api.account.InstallTheme({
            dark: dark === true,
            format: FORMAT,
            ...(reset ? {} : { theme: inputOf(c, { id, accessHash, slug }) }),
          })
        )
      );
      return { ok: true };
    });
  };

  const toggleTranslations = async ({ chat, disabled } = {}) => {
    if (!CHAT.test(String(chat ?? '')) || typeof disabled !== 'boolean') {
      return { ok: false, error: 'bad request', code: 'bad-request' };
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `translations-toggle:${chat}`, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.TogglePeerTranslations({ peer, disabled })
          )
        )
      );
      return { ok: true, disabled };
    });
  };

  return { cloudThemes, cloudTheme, installCloudTheme, toggleTranslations };
};
