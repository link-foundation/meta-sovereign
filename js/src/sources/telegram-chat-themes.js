/**
 * Chat themes, as Telegram Desktop's "Change colours" has them (R-Y170;
 * learned, never copied):
 * - `chatThemes({ fresh })` — the themes Telegram offers for chats
 *   (account.getChatThemes, asked again with the hash it gave so an
 *   unchanged list costs nothing) as `{ ok, themes: [{ emoticon, title,
 *   light, dark }] }`. `light` and `dark` are the colours of the theme's
 *   ThemeSettings for that mode (`{ base, accent, outgoing, messages }`,
 *   colour ints as Telegram has them, the page turns them into CSS), or
 *   null; a theme's wallpaper is left to the chat background code;
 * - `setChatTheme({ chat, emoticon })` — a theme of the list (emoticon ''
 *   for none) for a chat with a person (messages.setChatTheme), the one
 *   write. Only emoticons of the list are sent.
 * `themeOf(full)` is the emoticon of the theme a user's full info carries.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  THEME_INVALID: 'invalid',
  CHAT_ID_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  CHAT_WRITE_FORBIDDEN: 'no-access',
  USER_PRIVACY_RESTRICTED: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

/** A private chat's id (a user, never a group or a channel). */
export const USER_CHAT = /^\d{1,20}$/;
const LIST_MS = 10 * 60_000;
const DARK_BASES = ['BaseThemeNight', 'BaseThemeTinted'];

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

const BASES = {
  BaseThemeClassic: 'classic',
  BaseThemeDay: 'day',
  BaseThemeNight: 'night',
  BaseThemeTinted: 'tinted',
  BaseThemeArctic: 'arctic',
};

/** One ThemeSettings as `{ base, accent, outgoing, messages }`, or null. */
export const settingsPage = (settings) => {
  if (!settings || typeof settings.accentColor !== 'number') {
    return null;
  }
  const outgoing = settings.outboxAccentColor;
  return {
    base: BASES[settings.baseTheme?.className] ?? 'classic',
    accent: settings.accentColor,
    outgoing: typeof outgoing === 'number' ? outgoing : null,
    messages: (settings.messageColors ?? []).filter(
      (v) => typeof v === 'number'
    ),
  };
};

/** A Theme made for chats as the page keeps it, or null. */
export const themePage = (theme) => {
  const emoticon = String(theme?.emoticon ?? '');
  if (theme?.className !== 'Theme' || !emoticon || emoticon.length > 32) {
    return null;
  }
  const all = theme.settings ?? [];
  const dark = all.find((s) => DARK_BASES.includes(s.baseTheme?.className));
  const light = all.find((s) => s !== dark);
  return {
    emoticon,
    title: String(theme.title ?? ''),
    light: settingsPage(light),
    dark: settingsPage(dark),
  };
};

/** The emoticon of the theme a user's full info carries, or ''. */
export const themeOf = (full) =>
  full?.theme?.className === 'ChatTheme' ? String(full.theme.emoticon) : '';

export const createChatThemes = (env, { userClient }) => {
  let kept = null; // { at, hash, answer }

  const chatThemes = async ({ fresh = false } = {}) => {
    if (!fresh && kept && Date.now() - kept.at < LIST_MS) {
      return kept.answer;
    }
    return connected(env, userClient, failure, async (c) => {
      const got = await runIn(env, 'chat-themes:list', () =>
        c.client.invoke(
          new c.Api.account.GetChatThemes({
            hash: kept ? c.helpers.returnBigInt(kept.hash) : c.zero,
          })
        )
      );
      if (got?.className === 'account.ThemesNotModified' && kept) {
        kept.at = Date.now();
        return kept.answer;
      }
      const themes = (got?.themes ?? []).map(themePage).filter(Boolean);
      const answer = { ok: true, themes };
      kept = { at: Date.now(), hash: text(got?.hash) || '0', answer };
      return answer;
    });
  };

  // The one write: a theme of the list (or none) for a chat with a person.
  const setChatTheme = async ({ chat, emoticon = '' } = {}) => {
    const wanted = String(emoticon ?? '');
    if (!USER_CHAT.test(String(chat ?? ''))) {
      return { ok: false, error: 'bad chat', code: 'bad-request' };
    }
    if (wanted !== '') {
      const list = await chatThemes();
      if (!list.ok || !list.themes.some((th) => th.emoticon === wanted)) {
        return { ok: false, error: 'unknown theme', code: 'invalid' };
      }
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `chat-theme-set:${chat}`, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.SetChatTheme({
              peer,
              theme:
                wanted === ''
                  ? new c.Api.InputChatThemeEmpty()
                  : new c.Api.InputChatTheme({ emoticon: wanted }),
            })
          )
        )
      );
      return { ok: true };
    });
  };

  return { chatThemes, setChatTheme };
};
