// The link preview of the message box (R-Y145): the route of the POSTS
// table in routes-telegram.js, validated strictly before the account is
// asked. The picture is served by GET /api/telegram/link-preview-photo
// (routes-telegram-files.js).

import { PREVIEW_URL } from '../sources/telegram-link-preview.js';

const MAX_TEXT = 8192;

export const LINK_PREVIEW_POSTS = {
  'link-preview': async (account, body) =>
    typeof body.text === 'string' &&
    body.text.length > 0 &&
    body.text.length <= MAX_TEXT &&
    typeof body.url === 'string' &&
    PREVIEW_URL.test(body.url) &&
    typeof account.linkPreview === 'function'
      ? [200, await account.linkPreview({ text: body.text, url: body.url })]
      : [400, { error: 'text and url required', code: 'bad-request' }],
};
