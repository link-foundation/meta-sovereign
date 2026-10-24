/**
 * What the emoji panel needs to offer custom emoji and category tabs, as
 * Telegram Desktop's does (R-Y214; learned, never copied):
 * - `emojiPanelInfo({ status })` → `{ ok, premium, groups }`: whether the
 *   account has Premium (users.getUsers, who may insert custom emoji
 *   anywhere) and Telegram's emoji groups ("Love", "Joy"…;
 *   messages.getEmojiGroups, or getEmojiStatusGroups for the status
 *   picker), each `{ title, iconEmojiId, emoticons }` — the custom emoji
 *   that draws its tab and the standard emoji it filters the grid to.
 *   Kept ten minutes by kind; a failure of the groups leaves `[]`.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const KEEP_MS = 10 * 60_000;
const MAX_GROUPS = 60;
const MAX_EMOTICONS = 400;

const failure = failureOf({});

const text = (value) => String(value?.value ?? value);

/** A group as the page takes it; null when it filters nothing. */
export const groupOf = (group) => {
  const emoticons = (group?.emoticons ?? [])
    .map(String)
    .filter(Boolean)
    .slice(0, MAX_EMOTICONS);
  return group?.title !== undefined && emoticons.length > 0
    ? {
        title: String(group.title),
        iconEmojiId: /^\d{1,20}$/.test(text(group.iconEmojiId))
          ? text(group.iconEmojiId)
          : null,
        emoticons,
      }
    : null;
};

const premiumOf = async (env, c) => {
  try {
    const users = await runIn(env, 'emoji-panel:self', () =>
      c.client.invoke(
        new c.Api.users.GetUsers({ id: [new c.Api.InputUserSelf()] })
      )
    );
    return Boolean(users?.[0]?.premium);
  } catch {
    return false;
  }
};

const groupsOf = async (env, c, status) => {
  const Request = status
    ? c.Api.messages.GetEmojiStatusGroups
    : c.Api.messages.GetEmojiGroups;
  try {
    const answer = await runIn(env, `emoji-panel:groups:${status}`, () =>
      c.client.invoke(new Request({ hash: 0 }))
    );
    return (answer?.groups ?? [])
      .map(groupOf)
      .filter(Boolean)
      .slice(0, MAX_GROUPS);
  } catch {
    return [];
  }
};

export const createEmojiGroups = (
  env,
  { userClient },
  { now = () => Date.now() } = {}
) => {
  const kept = new Map(); // 'status' | 'panel' -> { at, answer }

  const emojiPanelInfo = async ({ status = false } = {}) => {
    const key = status === true ? 'status' : 'panel';
    const entry = kept.get(key);
    if (entry && now() - entry.at < KEEP_MS) {
      return entry.answer;
    }
    const answer = await connected(env, userClient, failure, async (c) => ({
      ok: true,
      premium: await premiumOf(env, c),
      groups: await groupsOf(env, c, key === 'status'),
    }));
    if (answer.ok) {
      kept.set(key, { at: now(), answer });
    }
    return answer;
  };

  return { emojiPanelInfo };
};
