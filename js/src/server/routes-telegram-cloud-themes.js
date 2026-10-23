// Cloud themes and the per-chat translation switch (R-Y209): the routes of
// the POSTS table in routes-telegram.js, each validated strictly before the
// account is asked.
//
// Its routes:
//   POST /api/telegram/cloud-themes {fresh?} -> { ok, themes: [{ id,
//                       accessHash, slug, title, creator, default, forChat,
//                       light, dark }] } the account's and Telegram's themes
//   POST /api/telegram/cloud-theme {slug} -> { ok, theme } one theme by the
//                       slug of its t.me/addtheme link
//   POST /api/telegram/cloud-theme-install {id, accessHash | slug, dark?}
//                       or {reset: true} -> { ok } the theme recorded as the
//                       account's, or the default put back
//   POST /api/telegram/translations-toggle {chat, disabled} -> { ok,
//                       disabled } "Do not translate this chat" on or off

import { CHAT, DIGITS, SLUG } from '../sources/telegram-cloud-themes.js';

const BAD = [400, { error: 'bad request', code: 'bad-request' }];

const call = async (account, method, arg) =>
  typeof account[method] === 'function'
    ? [200, await account[method](arg)]
    : BAD;

const installBody = (body) => {
  if (body.dark !== undefined && typeof body.dark !== 'boolean') {
    return null;
  }
  const dark = body.dark === true;
  if (body.reset === true) {
    return { reset: true, dark };
  }
  if (DIGITS.test(String(body.id ?? '')) && DIGITS.test(body.accessHash)) {
    return { id: body.id, accessHash: body.accessHash, dark };
  }
  return SLUG.test(String(body.slug ?? '')) ? { slug: body.slug, dark } : null;
};

export const CLOUD_THEME_POSTS = {
  'cloud-themes': async (account, body) =>
    body.fresh === undefined || typeof body.fresh === 'boolean'
      ? call(account, 'cloudThemes', { fresh: body.fresh === true })
      : BAD,
  'cloud-theme': async (account, body) =>
    SLUG.test(String(body.slug ?? ''))
      ? call(account, 'cloudTheme', { slug: body.slug })
      : BAD,
  'cloud-theme-install': async (account, body) => {
    const parsed = installBody(body);
    return parsed ? call(account, 'installCloudTheme', parsed) : BAD;
  },
  'translations-toggle': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) && typeof body.disabled === 'boolean'
      ? call(account, 'toggleTranslations', {
          chat: String(body.chat),
          disabled: body.disabled,
        })
      : BAD,
};
