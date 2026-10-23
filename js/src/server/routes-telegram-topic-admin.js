// Managing a forum group's topics (R-Y153): the routes of the POSTS table
// in routes-telegram.js, each validated strictly before the account is
// asked. The sources validate again; this keeps junk off the account.
//
// Its routes:
//   POST /api/telegram/topic-icons {} -> { ok, icons: [{ id, emoji }] } the
//                       emoji a topic may carry (R-Y153)
//   POST /api/telegram/topic-create {chat, title, iconColor, iconEmojiId?}
//                       -> { ok } title up to 128, one of Telegram's six
//                       colours (R-Y153)
//   POST /api/telegram/topic-edit {chat, topic, title?, iconEmojiId?,
//                       closed?, hidden?} -> { ok } (R-Y153)
//   POST /api/telegram/topic-pin {chat, topic, pinned} -> { ok } (R-Y153)
//   POST /api/telegram/topic-delete {chat, topic} -> { ok } the topic and
//                       its messages, never General (R-Y153)
//   POST /api/telegram/forum-toggle {chat, enabled} -> { ok } a
//                       supergroup's Topics on or off (R-Y153)

import { TITLE_MAX, TOPIC_COLORS } from '../sources/telegram-topic-admin.js';
import { invalid, route } from './routes-telegram-admin-extras.js';

const CHANNEL = /^-100\d{1,20}$/;
const ID = /^\d{1,20}$/;
const topicOk = (v) => Number.isInteger(v) && v > 0;
const titleOk = (v) =>
  typeof v === 'string' &&
  v.trim() !== '' &&
  Array.from(v.trim()).length <= TITLE_MAX;
const emojiOk = (v) => v === undefined || ID.test(String(v));
const flagOk = (v) => v === undefined || typeof v === 'boolean';
const inChannel = (body) => CHANNEL.test(String(body.chat ?? ''));

export const TOPIC_ADMIN_POSTS = {
  'topic-icons': async (account) =>
    typeof account.topicIcons === 'function'
      ? [200, await account.topicIcons({})]
      : invalid('not supported'),
  'topic-create': route(
    'createTopic',
    'chat, title and colour required',
    (b) =>
      inChannel(b) &&
      titleOk(b.title) &&
      TOPIC_COLORS.includes(b.iconColor) &&
      emojiOk(b.iconEmojiId)
  ),
  'topic-edit': route(
    'editTopic',
    'chat, topic and a change required',
    (b) =>
      inChannel(b) &&
      topicOk(b.topic) &&
      (b.title === undefined || titleOk(b.title)) &&
      emojiOk(b.iconEmojiId) &&
      flagOk(b.closed) &&
      flagOk(b.hidden) &&
      ['title', 'iconEmojiId', 'closed', 'hidden'].some(
        (k) => b[k] !== undefined
      )
  ),
  'topic-pin': route(
    'pinTopic',
    'chat, topic and pinned required',
    (b) => inChannel(b) && topicOk(b.topic) && typeof b.pinned === 'boolean'
  ),
  'topic-delete': route(
    'deleteTopic',
    'chat and topic required',
    (b) => inChannel(b) && topicOk(b.topic) && b.topic !== 1
  ),
  'forum-toggle': route(
    'toggleForum',
    'chat and enabled required',
    (b) => inChannel(b) && typeof b.enabled === 'boolean'
  ),
};
