// Viewing stories (R-Y140): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.

const CHAT = /^-?\d{1,20}$/;
const STATE = /^[A-Za-z0-9+/=_-]{1,256}$/;

const bad = (error) => [400, { error, code: 'bad-request' }];

export const STORIES_POSTS = {
  stories: async (account, body) =>
    (body.state === undefined ||
      (typeof body.state === 'string' && STATE.test(body.state))) &&
    typeof account.stories === 'function'
      ? [
          200,
          await account.stories(
            body.state === undefined ? {} : { state: body.state }
          ),
        ]
      : bad('a page state or nothing required'),
  'stories-peer': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    typeof account.storiesPeer === 'function'
      ? [200, await account.storiesPeer({ chat: String(body.chat) })]
      : bad('chat required'),
  'stories-read': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    Number.isInteger(body.maxId) &&
    body.maxId > 0 &&
    typeof account.storiesRead === 'function'
      ? [
          200,
          await account.storiesRead({
            chat: String(body.chat),
            maxId: body.maxId,
          }),
        ]
      : bad('chat and maxId required'),
};
