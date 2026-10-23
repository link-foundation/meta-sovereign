/**
 * Viewing Telegram stories, as Telegram Desktop does (R-Y140; learned,
 * never copied). Read only — posting a story is not here:
 * - `stories({ state })` — the strip above the chat list
 *   (stories.getAllStories, not hidden; `hidden: true` the hidden ones,
 *   R-Y148): the first call has no `state`;
 *   a call with the `state` an answer gave asks for the next page
 *   (`next`). → `{ ok, peers: [{ peer, name, self, count, lastId,
 *   maxReadId, unread }], state, more }` (`notModified` when Telegram
 *   says nothing changed); each answer also has `stealth: { activeUntil,
 *   cooldownUntil }` (stories stealth mode, R-Y199);
 * - `storiesPeer({ chat })` — one peer's stories to show
 *   (stories.getPeerStories; the skipped and `min` ones read again with
 *   stories.getStoriesByID) → `{ ok, peer, stories: [{ id, date, expire,
 *   caption, entities, media: { kind, duration, w, h }, mine, views,
 *   reactions, reaction }] }`;
 * - `storiesRead({ chat, maxId })` — they were seen up to `maxId`
 *   (stories.readStories);
 * - `storyMedia({ chat, id })` — a story's picture (the largest size) or
 *   video, for GET /api/telegram/story: found by stories.getStoriesByID,
 *   downloaded once into `<media>/stories/<chat>/<id>` and served from
 *   there afterwards. Media areas, reactions and replies are not here.
 * Telegram's errors become codes the page shows as text.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { bigSize, locationOf, pickSize, readCache } from './telegram-media.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  USER_ID_INVALID: 'no-access',
  STORY_ID_INVALID: 'gone',
  STORIES_NEVER_CREATED: 'gone',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

const CHAT = /^-?\d{1,20}$/;
const STATE = /^[A-Za-z0-9+/=_-]{1,256}$/;
// A story video larger than this is not downloaded.
const MAX_VIDEO = 64 * 1024 * 1024;

const textOf = (value) => String(value?.value ?? value);

export const peerId = (peer) => {
  if (peer?.userId !== undefined) {
    return textOf(peer.userId);
  }
  if (peer?.channelId !== undefined) {
    return `-100${textOf(peer.channelId)}`;
  }
  return peer?.chatId === undefined ? '' : `-${textOf(peer.chatId)}`;
};

export const nameOf = (entity) =>
  entity?.title ||
  [entity?.firstName, entity?.lastName].filter(Boolean).join(' ') ||
  entity?.username ||
  '';

// The user or chat a peer is, among an answer's `users` and `chats`.
export const entityOf = (answer, peer) => {
  const list = peer?.userId === undefined ? answer.chats : answer.users;
  const want =
    peer?.userId === undefined
      ? textOf(peer?.channelId ?? peer?.chatId)
      : textOf(peer.userId);
  return (list ?? []).find((e) => textOf(e.id) === want);
};

const attributeOf = (doc, name) =>
  (doc?.attributes ?? []).find((a) => a?.className === name) ?? null;

const numberOr = (value) => Number(value ?? 0) || null;

// A document story: a video with its length and size, a picture, or none.
const documentMedia = (doc) => {
  const video = attributeOf(doc, 'DocumentAttributeVideo');
  if (video || /^video\//.test(doc.mimeType ?? '')) {
    return {
      kind: 'video',
      duration: numberOr(video?.duration),
      w: numberOr(video?.w),
      h: numberOr(video?.h),
    };
  }
  return { kind: /^image\//.test(doc.mimeType ?? '') ? 'photo' : 'none' };
};

/** What a story shows: `{ kind: 'photo' | 'video' | 'none', … }`. */
export const mediaOf = (media) => {
  if (media?.className === 'MessageMediaPhoto' && media.photo?.sizes) {
    return { kind: 'photo' };
  }
  const doc =
    media?.className === 'MessageMediaDocument' ? media.document : null;
  return doc?.id ? documentMedia(doc) : { kind: 'none' };
};

const shapeEntity = (e) => ({
  className: String(e?.className ?? ''),
  offset: Number(e?.offset ?? 0),
  length: Number(e?.length ?? 0),
  ...(e?.url ? { url: String(e.url) } : {}),
  ...(e?.language ? { language: String(e.language) } : {}),
  ...(e?.documentId === undefined ? {} : { documentId: textOf(e.documentId) }),
});

// Whom a story is for, as the posting dialog names it (R-Y210).
const privacyOf = (item) => {
  if (item.selectedContacts) {
    return 'selected';
  }
  if (item.closeFriends) {
    return 'close-friends';
  }
  return item.contacts ? 'contacts' : 'everyone';
};

/**
 * A story the page can show, null when it is deleted, `{ id, partial }`
 * when Telegram skipped it or sent only part (read again by its id).
 */
export const shapeStory = (item) => {
  if (!item || item.className === 'StoryItemDeleted') {
    return null;
  }
  if (item.className === 'StoryItemSkipped' || item.min) {
    return { id: Number(item.id), partial: true };
  }
  return {
    id: Number(item.id),
    date: Number(item.date ?? 0),
    expire: Number(item.expireDate ?? 0),
    caption: String(item.caption ?? ''),
    entities: (item.entities ?? []).map(shapeEntity),
    media: mediaOf(item.media),
    mine: Boolean(item.out),
    pinned: Boolean(item.pinned),
    public: Boolean(item.public),
    privacy: privacyOf(item),
    views: Number(item.views?.viewsCount ?? 0),
    reactions: Number(item.views?.reactionsCount ?? 0),
    reaction:
      item.sentReaction?.className === 'ReactionEmoji'
        ? String(item.sentReaction.emoticon)
        : '',
  };
};

// A peer's row in the strip.
const peerHead = (answer, stories) => {
  const entity = entityOf(answer, stories.peer);
  const ids = (stories.stories ?? [])
    .filter((s) => s?.className !== 'StoryItemDeleted')
    .map((s) => Number(s.id));
  const lastId = ids.length > 0 ? Math.max(...ids) : 0;
  const maxReadId = Number(stories.maxReadId ?? 0);
  return {
    peer: peerId(stories.peer),
    name: nameOf(entity),
    self: Boolean(entity?.self),
    count: ids.length,
    lastId,
    maxReadId,
    unread: !entity?.self && maxReadId < lastId,
  };
};

const badRequest = { ok: false, error: 'bad request', code: 'failed' };

/**
 * Stealth mode as the page keeps it (R-Y199): `{ activeUntil, cooldownUntil }`
 * in unix seconds, 0 when not set (StoriesStealthMode).
 */
export const shapeStealth = (mode) => ({
  activeUntil: Number(mode?.activeUntilDate ?? 0),
  cooldownUntil: Number(mode?.cooldownUntilDate ?? 0),
});

const allStories = (env, userClient) => async (request) => {
  const state = request?.state;
  if (
    state !== undefined &&
    !(typeof state === 'string' && STATE.test(state))
  ) {
    return badRequest;
  }
  const hidden = request?.hidden === true;
  return connected(env, userClient, failure, async (c) => {
    const answer = await runIn(env, 'stories', () =>
      c.client.invoke(
        new c.Api.stories.GetAllStories({
          hidden,
          ...(state ? { next: true, state } : {}),
        })
      )
    );
    if (answer?.className === 'stories.AllStoriesNotModified') {
      return {
        ok: true,
        notModified: true,
        peers: [],
        state: answer.state,
        stealth: shapeStealth(answer.stealthMode),
      };
    }
    return {
      ok: true,
      peers: (answer?.peerStories ?? [])
        .map((p) => peerHead(answer, p))
        .filter((p) => p.peer && p.count > 0),
      state: String(answer?.state ?? ''),
      more: Boolean(answer?.hasMore),
      stealth: shapeStealth(answer?.stealthMode),
    };
  });
};

// The stories the first answer left partial, read again by id.
const completed = async (c, peer, items) => {
  const wanted = items.filter((s) => s?.partial).map((s) => s.id);
  if (wanted.length === 0) {
    return items;
  }
  const again = await c.client
    .invoke(new c.Api.stories.GetStoriesByID({ peer, id: wanted }))
    .then((answer) => (answer?.stories ?? []).map(shapeStory))
    .catch(() => []);
  const whole = again.filter((s) => s && !s.partial);
  const byId = new Map(whole.map((s) => [s.id, s]));
  return items.map((s) => (s?.partial ? (byId.get(s.id) ?? null) : s));
};

const peerStories = (env, userClient) => async (request) => {
  const chat = String(request?.chat ?? '');
  if (!CHAT.test(chat)) {
    return badRequest;
  }
  return connected(env, userClient, failure, async (c) =>
    runIn(env, `stories-peer:${chat}`, () =>
      env.connection.withPeer(c.client, chat, async (peer) => {
        const answer = await c.client.invoke(
          new c.Api.stories.GetPeerStories({ peer })
        );
        const shaped = (answer.stories.stories ?? []).map(shapeStory);
        const stories = (await completed(c, peer, shaped))
          .filter(Boolean)
          .sort((a, b) => a.id - b.id);
        return {
          ok: true,
          peer: peerHead(answer, answer.stories),
          stories,
        };
      })
    )
  );
};

const readStories = (env, userClient) => async (request) => {
  const chat = String(request?.chat ?? '');
  const maxId = request?.maxId;
  if (!CHAT.test(chat) || !Number.isInteger(maxId) || maxId <= 0) {
    return badRequest;
  }
  return connected(env, userClient, failure, async (c) =>
    runIn(env, `stories-read:${chat}`, () =>
      env.connection.withPeer(c.client, chat, async (peer) => {
        await c.client.invoke(new c.Api.stories.ReadStories({ peer, maxId }));
        return { ok: true };
      })
    )
  );
};

/**
 * What to download for a story item: `{ kind, file, thumb, mimeType }`
 * as locationOf reads it (a photo's largest size, or the video), or null.
 */
export const storyFile = (item) => {
  const media = item?.media;
  if (media?.className === 'MessageMediaPhoto' && media.photo?.sizes) {
    const thumb = pickSize(media.photo.sizes, 'w');
    return thumb
      ? { kind: 'photo', file: media.photo, thumb, mimeType: 'image/jpeg' }
      : null;
  }
  const doc =
    media?.className === 'MessageMediaDocument' ? media.document : null;
  if (!doc?.id || Number(doc.size ?? 0) > MAX_VIDEO) {
    return null;
  }
  return { kind: 'document', file: doc, thumb: '', mimeType: doc.mimeType };
};

const SERVED = /^(image|video)\//;

const createStoryMedia = (env, userClient, dir) => {
  const flights = new Map();

  const fetchStory = async (c, chat, id) => {
    const answer = await env.connection.withPeer(c.client, chat, (peer) =>
      c.client.invoke(new c.Api.stories.GetStoriesByID({ peer, id: [id] }))
    );
    return (answer?.stories ?? []).find(
      (s) => s?.className === 'StoryItem' && Number(s.id) === id
    );
  };

  const download = async (c, chat, id) => {
    const picture = storyFile(await fetchStory(c, chat, id));
    if (!picture) {
      return null;
    }
    const size = Number(picture.file.size ?? 0);
    const buffer = await c.client.downloadFile(
      locationOf(c.Api, c.helpers, picture),
      {
        dcId: Number(picture.file.dcId),
        fileSize: bigSize(c.helpers, size || MAX_VIDEO),
      }
    );
    return buffer?.length
      ? { buffer: Buffer.from(buffer), mimeType: picture.mimeType }
      : null;
  };

  const load = async (chat, id, file) => {
    const got = await connected(
      env,
      userClient,
      () => null,
      (c) => runIn(env, `story:${chat}:${id}`, () => download(c, chat, id))
    );
    if (!got?.buffer || !SERVED.test(got.mimeType ?? '')) {
      return null;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, got.buffer);
    await fs.writeFile(`${file}.type`, got.mimeType);
    return got;
  };

  return async (request) => {
    const chat = String(request?.chat ?? '');
    const id = Number(request?.id);
    if (!dir || !CHAT.test(chat) || !Number.isInteger(id) || id <= 0) {
      return null;
    }
    const file = path.join(dir, 'stories', chat, String(id));
    const cached = await readCache(file);
    if (cached) {
      const type = await readCache(`${file}.type`);
      return { buffer: cached, mimeType: type?.toString() || 'image/jpeg' };
    }
    // A player asks for a video in ranges: one download serves them all.
    const key = `${chat}:${id}`;
    if (!flights.has(key)) {
      flights.set(
        key,
        load(chat, id, file)
          .catch(() => null)
          .finally(() => flights.delete(key))
      );
    }
    return flights.get(key);
  };
};

export const createStories = (env, { userClient, mediaDir }) => ({
  stories: allStories(env, userClient),
  storiesPeer: peerStories(env, userClient),
  storiesRead: readStories(env, userClient),
  storyMedia: createStoryMedia(env, userClient, mediaDir),
});
