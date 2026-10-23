/**
 * What Telegram Desktop lets one do with a story besides watching it
 * (R-Y148; learned, never copied):
 * - `storyReply({ chat, id, text })` — "Reply privately…": a message to
 *   the story's owner that answers the story (messages.sendMessage with
 *   InputReplyToStory); it shows in the chat through the live handler;
 * - `storyReact({ chat, id, reaction })` — a reaction to the story
 *   (stories.sendReaction): an emoji, or `''` to take the reaction back
 *   (ReactionEmpty);
 * - `storyViews({ chat, id, offset })` — the viewers of one's own story,
 *   50 at a time (stories.getStoryViewsList) → `{ ok, count, viewsCount,
 *   reactionsCount, views: [{ kind, user, name, date, reaction }], next }`;
 *   `next` is the offset of the following page, '' at the end; `q`,
 *   `justContacts`, `reactionsFirst`, `forwardsFirst` filter and order the
 *   list, and a forward or repost of the story is an entry of its own
 *   (`kind` 'forward' | 'repost', R-Y199);
 * - `storyDelete({ chat, id })` — one's own story deleted
 *   (stories.deleteStories);
 * - `storiesHide({ chat, hidden })` — a peer's stories moved to or from
 *   the hidden list (stories.togglePeerStoriesHidden).
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { randomIdOf } from './telegram-send.js';
import { entityOf, nameOf as entityName, peerId } from './telegram-stories.js';

const CODES = {
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  USER_ID_INVALID: 'no-access',
  USER_IS_BLOCKED: 'no-access',
  PRIVACY_PREMIUM_REQUIRED: 'no-access',
  STORY_ID_INVALID: 'gone',
  STORIES_NEVER_CREATED: 'gone',
  REACTION_INVALID: 'bad-reaction',
  MESSAGE_TOO_LONG: 'too-long',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

const CHAT = /^-?\d{1,20}$/;
const OFFSET = /^[A-Za-z0-9+/=_.-]{0,256}$/;
const REACTION = /^\S{1,24}$/u;
/** Telegram's page of a story's viewers. */
export const VIEWS_LIMIT = 50;
const MAX_TEXT = 4096;

export const badRequest = { ok: false, error: 'bad request', code: 'failed' };

const textOf = (value) => String(value?.value ?? value);

export const storyOk = (request) =>
  CHAT.test(String(request?.chat ?? '')) &&
  Number.isInteger(request?.id) &&
  request.id > 0;

// A reaction as the page keeps it: an emoji, or '' for none.
export const reactionOf = (reaction) =>
  reaction?.className === 'ReactionEmoji' ? String(reaction.emoticon) : '';

const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';

// The viewer's peer and date: a person, or — for a public forward or
// repost of the story (R-Y199) — the chat that shared it.
const sharedBy = (view) =>
  view.className === 'StoryViewPublicForward'
    ? { peer: view.message?.peerId, date: view.message?.date, kind: 'forward' }
    : {
        peer: view.peerId,
        date: view.story?.date,
        kind: 'repost',
      };

/** One viewer of a story, as the page shows it. */
export const shapeView = (view, users, chats = []) => {
  if (view.userId === undefined) {
    const { peer, date, kind } = sharedBy(view);
    return {
      kind,
      user: peerId(peer),
      name: entityName(entityOf({ users, chats }, peer)),
      date: Number(date ?? 0),
      reaction: '',
    };
  }
  const id = textOf(view.userId);
  const user = (users ?? []).find((u) => textOf(u.id) === id);
  return {
    kind: 'view',
    user: id,
    name: nameOf(user),
    date: Number(view.date ?? 0),
    reaction: reactionOf(view.reaction),
  };
};

const withStory = (env, userClient, request, key, use) =>
  connected(env, userClient, failure, (c) =>
    runIn(env, `${key}:${request.chat}`, () =>
      env.connection.withPeer(c.client, String(request.chat), (peer) =>
        use(c, peer)
      )
    )
  );

const reply = (env, userClient) => async (request) => {
  const text = String(request?.text ?? '').trim();
  if (!storyOk(request) || !text || text.length > MAX_TEXT) {
    return badRequest;
  }
  return withStory(env, userClient, request, 'story-reply', async (c, peer) => {
    await c.client.invoke(
      new c.Api.messages.SendMessage({
        peer,
        message: text,
        randomId: randomIdOf(null, 0, c.helpers),
        replyTo: new c.Api.InputReplyToStory({ peer, storyId: request.id }),
      })
    );
    return { ok: true };
  });
};

const react = (env, userClient) => async (request) => {
  const reaction = request?.reaction;
  if (
    !storyOk(request) ||
    typeof reaction !== 'string' ||
    (reaction !== '' && !REACTION.test(reaction))
  ) {
    return badRequest;
  }
  return withStory(env, userClient, request, 'story-react', async (c, peer) => {
    await c.client.invoke(
      new c.Api.stories.SendReaction({
        peer,
        storyId: request.id,
        reaction: reaction
          ? new c.Api.ReactionEmoji({ emoticon: reaction })
          : new c.Api.ReactionEmpty(),
        ...(reaction ? { addToRecent: true } : {}),
      })
    );
    return { ok: true, reaction };
  });
};

const FLAGS = ['justContacts', 'reactionsFirst', 'forwardsFirst'];

// The optional filters of the viewers list (R-Y199), or null when wrong.
const filtersOf = (request) => {
  const q = request?.q;
  const flags = FLAGS.filter((f) => request?.[f] !== undefined);
  if (
    (q !== undefined && !(typeof q === 'string' && q.length <= 128)) ||
    flags.some((f) => typeof request[f] !== 'boolean')
  ) {
    return null;
  }
  return {
    ...(q ? { q } : {}),
    ...Object.fromEntries(
      flags.filter((f) => request[f]).map((f) => [f, true])
    ),
  };
};

const views = (env, userClient) => async (request) => {
  const offset = request?.offset ?? '';
  const filters = filtersOf(request);
  if (
    !storyOk(request) ||
    typeof offset !== 'string' ||
    !OFFSET.test(offset) ||
    !filters
  ) {
    return badRequest;
  }
  return withStory(env, userClient, request, 'story-views', async (c, peer) => {
    const answer = await c.client.invoke(
      new c.Api.stories.GetStoryViewsList({
        peer,
        id: request.id,
        offset,
        limit: VIEWS_LIMIT,
        ...filters,
      })
    );
    return {
      ok: true,
      count: Number(answer?.count ?? 0),
      viewsCount: Number(answer?.viewsCount ?? 0),
      reactionsCount: Number(answer?.reactionsCount ?? 0),
      forwardsCount: Number(answer?.forwardsCount ?? 0),
      views: (answer?.views ?? [])
        .map((v) => shapeView(v, answer.users, answer.chats))
        .filter((v) => v.user),
      next: String(answer?.nextOffset ?? ''),
    };
  });
};

const remove = (env, userClient) => async (request) => {
  if (!storyOk(request)) {
    return badRequest;
  }
  return withStory(
    env,
    userClient,
    request,
    'story-delete',
    async (c, peer) => {
      await c.client.invoke(
        new c.Api.stories.DeleteStories({ peer, id: [request.id] })
      );
      return { ok: true };
    }
  );
};

const hide = (env, userClient) => async (request) => {
  if (
    !CHAT.test(String(request?.chat ?? '')) ||
    typeof request?.hidden !== 'boolean'
  ) {
    return badRequest;
  }
  return withStory(
    env,
    userClient,
    request,
    'stories-hide',
    async (c, peer) => {
      await c.client.invoke(
        new c.Api.stories.TogglePeerStoriesHidden({
          peer,
          hidden: request.hidden,
        })
      );
      return { ok: true, hidden: request.hidden };
    }
  );
};

export const createStoryActions = (env, { userClient }) => ({
  storyReply: reply(env, userClient),
  storyReact: react(env, userClient),
  storyViews: views(env, userClient),
  storyDelete: remove(env, userClient),
  storiesHide: hide(env, userClient),
});
