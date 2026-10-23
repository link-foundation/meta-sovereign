// Reaction tags of Saved Messages (R-Y151): the routes of the POSTS table
// in routes-telegram.js, each validated strictly before the account is
// asked.

import { TITLE_MAX, validReaction } from '../sources/telegram-saved-tags.js';

const bad = (error) => [400, { error, code: 'bad-request' }];
const CHAT = /^\d{1,20}$/;

const validOffset = (v) => v === undefined || (Number.isInteger(v) && v > 0);

export const SAVED_TAGS_POSTS = {
  'saved-tags': async (account) =>
    typeof account.savedTags === 'function'
      ? [200, await account.savedTags()]
      : bad('not supported'),
  'saved-tag-search': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    validReaction(body.reaction) &&
    validOffset(body.offsetId) &&
    typeof account.savedTagSearch === 'function'
      ? [
          200,
          await account.savedTagSearch({
            chat: String(body.chat),
            reaction: body.reaction,
            offsetId: body.offsetId,
          }),
        ]
      : bad('chat and a reaction required'),
  'saved-tag-rename': async (account, body) =>
    validReaction(body.reaction) &&
    typeof body.title === 'string' &&
    body.title.trim().length <= TITLE_MAX &&
    typeof account.savedTagRename === 'function'
      ? [
          200,
          await account.savedTagRename({
            reaction: body.reaction,
            title: body.title,
          }),
        ]
      : bad(`a reaction and a title of at most ${TITLE_MAX} characters`),
};
