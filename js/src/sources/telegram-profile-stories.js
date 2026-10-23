/**
 * Stories on a profile, as Telegram Desktop shows them (R-Y185; learned,
 * never copied):
 * - `profileStories({ chat, album?, offset? })` — a person's or channel's
 *   pinned stories (stories.getPinnedStories, `offset` the id to go on
 *   from) or, with `album`, one album's (stories.getAlbumStories, `offset`
 *   a count); the first page of the pinned ones also names the albums
 *   (stories.getAlbums) → `{ ok, count, mine, me, stories: [{ …shapeStory,
 *   pinned, top }], albums: [{ id, title }], next }`;
 * - `storiesArchive({ offset? })` — one's own archive of expired stories
 *   (stories.getStoriesArchive), the same story rows;
 * - `storyPin({ chat, ids, pinned })` — stories shown on or taken off the
 *   profile (stories.togglePinned; a WRITE, on a click only);
 * - `storyPinTop({ chat, ids })` — the stories fixed at the top of the
 *   profile (stories.togglePinnedToTop, up to 3; `[]` clears; a WRITE, on a
 *   click only).
 * The pictures and videos are the story viewer's (`storyMedia`).
 * Telegram's errors become codes the page shows as text.
 */

import { shapeStory } from './telegram-stories.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

export const PAGE = 30;
export const TOP_MAX = 3;

const CODES = {
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  USER_ID_INVALID: 'no-access',
  STORY_ID_INVALID: 'gone',
  STORIES_NEVER_CREATED: 'gone',
  ALBUM_ID_INVALID: 'gone',
  STORY_ID_EMPTY: 'gone',
  PINNED_TOO_MUCH: 'too-many',
  STORIES_TOO_MUCH: 'too-many',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };
const CHAT = /^-?\d{1,20}$/;

const text = (value) => String(value?.value ?? value ?? '');
const count = (n) => Number(n ?? 0) || 0;
const natural = (n) => Number.isInteger(n) && n >= 0;
const idList = (ids, max) =>
  Array.isArray(ids) &&
  ids.length <= max &&
  ids.every((id) => Number.isInteger(id) && id > 0);

/** The stories of an answer as the page's rows (`top`: fixed on top). */
export const rowsOf = (answer) => {
  const top = new Set((answer?.pinnedToTop ?? []).map(Number));
  return (answer?.stories ?? [])
    .map((item) => {
      const story = shapeStory(item);
      return story && !story.partial
        ? { ...story, pinned: Boolean(item.pinned), top: top.has(story.id) }
        : null;
    })
    .filter(Boolean);
};

/** An album as the page's chip. */
export const albumOf = (album) => ({
  id: count(album.albumId),
  title: String(album.title ?? ''),
});

// Where the next page begins, or null at the end: an album's by a count,
// the pinned ones' by the lowest id of a full page.
const nextOf = (album, offset, answer, rows) => {
  if (album) {
    const total = count(answer?.count);
    return rows.length > 0 && offset + rows.length < total
      ? offset + rows.length
      : null;
  }
  const items = answer?.stories ?? [];
  return items.length >= PAGE
    ? Math.min(...items.map((s) => count(s.id)))
    : null;
};

export const createProfileStories = (env, { userClient }) => {
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));
  const withChat = (c, chat, use) =>
    env.connection.withPeer(c.client, chat, use);
  const meOf = async (c) =>
    text((await c.client.getMe?.().catch(() => null))?.id);

  // Telegram answers an albums request only when it has some.
  const albumsOf = async (c, peer) => {
    try {
      const answer = await c.client.invoke(
        new c.Api.stories.GetAlbums({ peer, hash: c.zero })
      );
      return (answer?.albums ?? []).map(albumOf);
    } catch {
      return [];
    }
  };

  const asked = (c, peer, { album, offset }) =>
    album
      ? c.client.invoke(
          new c.Api.stories.GetAlbumStories({
            peer,
            albumId: album,
            offset,
            limit: PAGE,
          })
        )
      : c.client.invoke(
          new c.Api.stories.GetPinnedStories({
            peer,
            offsetId: offset,
            limit: PAGE,
          })
        );

  const profileStories = async ({ chat, album, offset = 0 } = {}) =>
    !CHAT.test(String(chat ?? '')) ||
    !natural(offset) ||
    (album !== undefined && !(Number.isInteger(album) && album > 0))
      ? BAD
      : doing(`profile-stories:${chat}`, (c) =>
          withChat(c, String(chat), async (peer) => {
            const answer = await asked(c, peer, { album, offset });
            const rows = rowsOf(answer);
            const me = await meOf(c);
            return {
              ok: true,
              count: count(answer?.count),
              me,
              mine: me !== '' && me === String(chat),
              stories: rows,
              albums: !album && offset === 0 ? await albumsOf(c, peer) : [],
              next: nextOf(album, offset, answer, rows),
            };
          })
        );

  const storiesArchive = async ({ offset = 0 } = {}) =>
    !natural(offset)
      ? BAD
      : doing('profile-stories:archive', async (c) => {
          const answer = await c.client.invoke(
            new c.Api.stories.GetStoriesArchive({
              peer: new c.Api.InputPeerSelf(),
              offsetId: offset,
              limit: PAGE,
            })
          );
          const rows = rowsOf(answer);
          return {
            ok: true,
            count: count(answer?.count),
            me: await meOf(c),
            stories: rows,
            next: nextOf(0, offset, answer, rows),
          };
        });

  const storyPin = async ({ chat, ids, pinned } = {}) =>
    !CHAT.test(String(chat ?? '')) ||
    !idList(ids, PAGE) ||
    ids.length === 0 ||
    typeof pinned !== 'boolean'
      ? BAD
      : doing(`profile-stories:pin:${chat}`, (c) =>
          withChat(c, String(chat), async (peer) => {
            const done = await c.client.invoke(
              new c.Api.stories.TogglePinned({ peer, id: ids, pinned })
            );
            return { ok: true, pinned, ids: (done ?? []).map(Number) };
          })
        );

  const storyPinTop = async ({ chat, ids } = {}) =>
    !CHAT.test(String(chat ?? '')) || !idList(ids, TOP_MAX)
      ? BAD
      : doing(`profile-stories:top:${chat}`, (c) =>
          withChat(c, String(chat), async (peer) => {
            await c.client.invoke(
              new c.Api.stories.TogglePinnedToTop({ peer, id: ids })
            );
            return { ok: true, ids };
          })
        );

  return { profileStories, storiesArchive, storyPin, storyPinTop };
};
