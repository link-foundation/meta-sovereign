/**
 * The rest of Telegram Desktop's story features (R-Y199; learned, never
 * copied):
 * - `storyStealth({ past, future })` — "Stealth mode"
 *   (stories.activateStealthMode: hide the views of the past five minutes
 *   and/or of the next twenty-five) → `{ ok, stealth: { activeUntil,
 *   cooldownUntil } }` (unix seconds, from the UpdateStoriesStealthMode
 *   the answer carries; null when it carries none). A free account gets
 *   code `premium`, a cooldown still running `cooldown`;
 * - `storyReactions({ chat, id, reaction, forwardsFirst, offset })` — the
 *   viewers' "Reactions" list of one's own story
 *   (stories.getStoryReactionsList) → `{ ok, count, views: [{ kind, user,
 *   name, date, reaction }], next }`, a reaction, a public forward or a
 *   public repost each an entry (`kind` 'view' | 'forward' | 'repost');
 * - `storyReport({ chat, id, option, message })` — "Report" on someone
 *   else's story (stories.report), the same walk of reasons as
 *   peerReport's (ReportResult shaped by the same function);
 * - `storiesViews({ chat, ids })` — fresh counters of one's own stories
 *   (stories.getStoriesViews) → `{ ok, stories: [{ id, views, reactions,
 *   forwards }] }`.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { bytesOf, shapeReport } from './telegram-peer-actions.js';
import {
  VIEWS_LIMIT,
  badRequest,
  reactionOf,
  shapeView,
  storyOk,
} from './telegram-story-actions.js';
import { entityOf, nameOf, peerId, shapeStealth } from './telegram-stories.js';

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  PREMIUM_REQUIRED: 'premium',
  STORIES_STEALTH: 'cooldown',
  STEALTH_MODE: 'cooldown',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  STORY_ID_INVALID: 'gone',
  STORIES_NEVER_CREATED: 'gone',
  OPTION_INVALID: 'bad-option',
  MESSAGE_TOO_LONG: 'too-long',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

// Resolves the story's chat and runs `use` on it through the queue.
const withStory = (env, userClient, request, key, use) =>
  connected(env, userClient, failure, (c) =>
    runIn(env, `${key}:${request.chat}`, () =>
      env.connection.withPeer(c.client, String(request.chat), (peer) =>
        use(c, peer)
      )
    )
  );

const OFFSET = /^[A-Za-z0-9+/=_.-]{0,256}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const REACTION = /^\S{1,24}$/u;
const CHAT = /^-?\d{1,20}$/;
const MAX_IDS = 100;

// The stealth state an activation's answer carries, or null.
const stealthIn = (answer) => {
  const found = [answer, ...(answer?.updates ?? []), answer?.update]
    .filter(Boolean)
    .find((u) => u.className === 'UpdateStoriesStealthMode');
  return found ? shapeStealth(found.stealthMode) : null;
};

const stealth = (env, userClient) => async (request) => {
  const { past, future } = request ?? {};
  if (
    typeof past !== 'boolean' ||
    typeof future !== 'boolean' ||
    !(past || future)
  ) {
    return badRequest;
  }
  return connected(env, userClient, failure, async (c) => {
    const answer = await runIn(env, 'stories-stealth', () =>
      c.client.invoke(
        new c.Api.stories.ActivateStealthMode({
          ...(past ? { past: true } : {}),
          ...(future ? { future: true } : {}),
        })
      )
    );
    return { ok: true, stealth: stealthIn(answer) };
  });
};

// One entry of the reactions list (R-Y199).
const shapeReaction = (item, answer) => {
  const shared = {
    StoryReactionPublicForward: () => ({
      className: 'StoryViewPublicForward',
      message: item.message,
    }),
    StoryReactionPublicRepost: () => ({
      className: 'StoryViewPublicRepost',
      peerId: item.peerId,
      story: item.story,
    }),
  }[item.className];
  if (shared) {
    return shapeView(shared(), answer.users, answer.chats);
  }
  return {
    kind: 'view',
    user: peerId(item.peerId),
    name: nameOf(entityOf(answer, item.peerId)),
    date: Number(item.date ?? 0),
    reaction: reactionOf(item.reaction),
  };
};

const validReactions = (r) =>
  storyOk(r) &&
  (r.offset === undefined ||
    (typeof r.offset === 'string' && OFFSET.test(r.offset))) &&
  (r.reaction === undefined ||
    (typeof r.reaction === 'string' && REACTION.test(r.reaction))) &&
  (r.forwardsFirst === undefined || typeof r.forwardsFirst === 'boolean');

const reactions = (env, userClient) => async (request) => {
  if (!validReactions(request ?? {})) {
    return badRequest;
  }
  return withStory(
    env,
    userClient,
    request,
    'story-reactions',
    async (c, peer) => {
      const answer = await c.client.invoke(
        new c.Api.stories.GetStoryReactionsList({
          peer,
          id: request.id,
          offset: request.offset ?? '',
          limit: VIEWS_LIMIT,
          ...(request.forwardsFirst ? { forwardsFirst: true } : {}),
          ...(request.reaction
            ? {
                reaction: new c.Api.ReactionEmoji({
                  emoticon: request.reaction,
                }),
              }
            : {}),
        })
      );
      return {
        ok: true,
        count: Number(answer?.count ?? 0),
        views: (answer?.reactions ?? []).map((r) => shapeReaction(r, answer)),
        next: String(answer?.nextOffset ?? ''),
      };
    }
  );
};

const validReport = (r) =>
  storyOk(r) &&
  (r.option === undefined ||
    (typeof r.option === 'string' &&
      r.option.length <= 2048 &&
      BASE64.test(r.option))) &&
  (r.message === undefined ||
    (typeof r.message === 'string' && r.message.length <= 512));

const report = (env, userClient) => async (request) => {
  if (!validReport(request ?? {})) {
    return badRequest;
  }
  return withStory(env, userClient, request, 'story-report', async (c, peer) =>
    shapeReport(
      await c.client.invoke(
        new c.Api.stories.Report({
          peer,
          id: [request.id],
          option: bytesOf(request.option),
          message: request.message ?? '',
        })
      )
    )
  );
};

const validIds = (r) =>
  CHAT.test(String(r?.chat ?? '')) &&
  Array.isArray(r?.ids) &&
  r.ids.length > 0 &&
  r.ids.length <= MAX_IDS &&
  r.ids.every((id) => Number.isInteger(id) && id > 0);

const storiesViews = (env, userClient) => async (request) => {
  if (!validIds(request)) {
    return badRequest;
  }
  return withStory(
    env,
    userClient,
    request,
    'stories-views',
    async (c, peer) => {
      const answer = await c.client.invoke(
        new c.Api.stories.GetStoriesViews({ peer, id: request.ids })
      );
      return {
        ok: true,
        stories: request.ids.map((id, i) => ({
          id,
          views: Number(answer?.views?.[i]?.viewsCount ?? 0),
          reactions: Number(answer?.views?.[i]?.reactionsCount ?? 0),
          forwards: Number(answer?.views?.[i]?.forwardsCount ?? 0),
        })),
      };
    }
  );
};

export const createStoryExtras = (env, { userClient }) => ({
  storyStealth: stealth(env, userClient),
  storyReactions: reactions(env, userClient),
  storyReport: report(env, userClient),
  storiesViews: storiesViews(env, userClient),
});
