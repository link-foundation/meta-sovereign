/**
 * X (Twitter) source adapter (R-E3).
 *
 * Accepts the user's X data archive (`tweet.js` / `direct-messages.js`
 * extracted into JSON). The live side wraps X API v2 posts and Direct
 * Messages endpoints with an injectable fetch/baseUrl for tests.
 */

import { buildMessageLink } from './link.js';
import {
  authHeaders,
  compact,
  contentTarget,
  contentText,
  requestJson,
  resolveOption,
} from './http.js';

const SOURCE = 'x';

const dmText = (event) =>
  event.text ?? event.message_create?.message_data?.text ?? event.body ?? '';

const isDmEvent = (item) =>
  item.event_type === 'MessageCreate' || Boolean(item.dm_conversation_id);

const xDmToLink = (event) =>
  buildMessageLink({
    source: SOURCE,
    externalId: String(event.id ?? event.dm_event_id),
    sender: String(
      event.sender_id ?? event.message_create?.sender_id ?? 'unknown'
    ),
    chat: String(event.dm_conversation_id ?? event.conversation_id),
    body: dmText(event),
    timestamp: event.created_at ?? null,
  });

const xPostToLink = (post) =>
  buildMessageLink({
    source: SOURCE,
    externalId: String(post.id),
    sender: String(post.author_id ?? post.username ?? 'unknown'),
    chat: String(post.conversation_id ?? `post:${post.id}`),
    body: post.text ?? '',
    timestamp: post.created_at ?? null,
  });

export const xUpdatesToLinks = (payload) => {
  const data = Array.isArray(payload) ? payload : (payload?.data ?? []);
  return data.map((item) =>
    isDmEvent(item) ? xDmToLink(item) : xPostToLink(item)
  );
};

const xPullTarget = (options, configuredUserId) => {
  const search = {
    max_results: options.limit ?? options.maxResults ?? 50,
    pagination_token: options.paginationToken ?? options.offset,
  };
  if (options.conversationId) {
    return {
      path: `/2/dm_conversations/${options.conversationId}/dm_events`,
      search,
    };
  }
  if (options.participantId) {
    return {
      path: `/2/dm_conversations/with/${options.participantId}/dm_events`,
      search,
    };
  }
  if (options.mode === 'mentions' || options.userId || configuredUserId) {
    search['tweet.fields'] = 'created_at,author_id,conversation_id';
    return {
      path: `/2/users/${options.userId ?? configuredUserId}/mentions`,
      search,
    };
  }
  return { path: '/2/dm_events', search };
};

export const createXLive = ({
  token = null,
  userId = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://api.x.com',
  profileBaseUrl = 'https://api.x.com/1.1',
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(override ?? token, 'X_ACCESS_TOKEN', 'X access token');
  const headers = (override) => authHeaders(resolvedToken(override));

  return {
    async pullMessages(options = {}) {
      const { path, search } = xPullTarget(options, userId);
      const raw = await requestJson(fetchImpl, `${baseUrl}${path}`, {
        headers: headers(options.token),
        search,
      });
      const links = xUpdatesToLinks(raw);
      return {
        links,
        rawCount: Array.isArray(raw?.data) ? raw.data.length : links.length,
        nextOffset: raw?.meta?.next_token ?? null,
        raw,
      };
    },
    async post(content, options = {}) {
      const text = contentText(content);
      if (!text) {
        throw new Error('x post text is required');
      }
      const target = options.conversationId ?? content?.conversationId;
      const participant = options.participantId ?? contentTarget(content);
      if (target || participant) {
        const path = target
          ? `/2/dm_conversations/${target}/messages`
          : `/2/dm_conversations/with/${participant}/messages`;
        return requestJson(fetchImpl, `${baseUrl}${path}`, {
          method: 'POST',
          headers: headers(options.token),
          body: { text },
        });
      }
      return requestJson(fetchImpl, `${baseUrl}/2/tweets`, {
        method: 'POST',
        headers: headers(options.token),
        body: { text },
      });
    },
    async syncProfile(profile, options = {}) {
      const body = new URLSearchParams(
        compact({
          name: profile.name,
          url: profile.url ?? profile.website,
          location: profile.location,
          description: profile.description ?? profile.bio ?? profile.about,
        })
      );
      return requestJson(
        fetchImpl,
        `${profileBaseUrl}/account/update_profile.json`,
        {
          method: 'POST',
          headers: {
            ...headers(options.token),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        }
      );
    },
  };
};

export const xSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const t of obj.tweets ?? []) {
      const tw = t.tweet ?? t;
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(tw.id_str ?? tw.id),
          sender: 'self',
          chat: 'wall:self',
          body: tw.full_text ?? tw.text ?? '',
          timestamp: tw.created_at,
        })
      );
    }
    for (const dm of obj.dms ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(dm.id),
          sender: String(dm.senderId),
          chat: String(dm.conversationId),
          body: dm.text ?? '',
          timestamp: dm.createdAt,
        })
      );
    }
    return out;
  },
  live: createXLive(),
};
