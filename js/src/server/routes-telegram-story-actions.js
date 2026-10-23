// Story interactions (R-Y148): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/story-reply {chat, id, text} -> { ok } a private
//                       reply to a story (R-Y148)
//   POST /api/telegram/story-react {chat, id, reaction} -> { ok, reaction }
//                       an emoji reaction; '' takes it back
//   POST /api/telegram/story-views {chat, id, offset?} -> { ok, count,
//                       viewsCount, reactionsCount, views, next } the
//                       viewers of one's own story, 50 a page
//                       Also q?, justContacts?, reactionsFirst?,
//                       forwardsFirst? (search and order, R-Y199); each
//                       entry has a kind: view, forward or repost
//   POST /api/telegram/story-delete {chat, id} -> { ok } one's own story
//   POST /api/telegram/stories-hide {chat, hidden} -> { ok, hidden } a
//                       peer's stories to or from the hidden list

const CHAT = /^-?\d{1,20}$/;
// The viewers list's switches (R-Y199).
const VIEW_FLAGS = ['justContacts', 'reactionsFirst', 'forwardsFirst'];
const OFFSET = /^[A-Za-z0-9+/=_.-]{0,256}$/;

const bad = (error) => [400, { error, code: 'bad-request' }];

const storyOf = (body) =>
  CHAT.test(String(body.chat ?? '')) && Number.isInteger(body.id) && body.id > 0
    ? { chat: String(body.chat), id: body.id }
    : null;

// A route that asks `account[method]` with the story and `extra(body)`
// (null when the body is wrong).
const storyRoute =
  (method, what, extra = () => ({})) =>
  async (account, body) => {
    const story = storyOf(body);
    const more = story && extra(body);
    return story && more && typeof account[method] === 'function'
      ? [200, await account[method]({ ...story, ...more })]
      : bad(what);
  };

export const STORY_ACTION_POSTS = {
  'story-reply': storyRoute(
    'storyReply',
    'chat, id and text required',
    (body) =>
      typeof body.text === 'string' &&
      body.text.trim() &&
      body.text.length <= 4096
        ? { text: body.text }
        : null
  ),
  'story-react': storyRoute(
    'storyReact',
    'chat, id and reaction required',
    (body) =>
      typeof body.reaction === 'string' && body.reaction.length <= 24
        ? { reaction: body.reaction }
        : null
  ),
  'story-views': storyRoute('storyViews', 'chat and id required', (body) =>
    (body.offset === undefined ||
      (typeof body.offset === 'string' && OFFSET.test(body.offset))) &&
    (body.q === undefined ||
      (typeof body.q === 'string' && body.q.length <= 128)) &&
    VIEW_FLAGS.every(
      (flag) => body[flag] === undefined || typeof body[flag] === 'boolean'
    )
      ? {
          offset: body.offset ?? '',
          ...(body.q ? { q: body.q } : {}),
          ...Object.fromEntries(
            VIEW_FLAGS.filter((flag) => body[flag] === true).map((flag) => [
              flag,
              true,
            ])
          ),
        }
      : null
  ),
  'story-delete': storyRoute('storyDelete', 'chat and id required'),
  'stories-hide': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    typeof body.hidden === 'boolean' &&
    typeof account.storiesHide === 'function'
      ? [
          200,
          await account.storiesHide({
            chat: String(body.chat),
            hidden: body.hidden,
          }),
        ]
      : bad('chat and hidden required'),
};
