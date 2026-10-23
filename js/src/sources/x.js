/**
 * X (Twitter) source adapter (R-E3).
 *
 * Accepts the user's X data archive (`tweet.js` / `direct-messages.js`
 * extracted into JSON). The live side wraps X API v2 posts and Direct
 * Messages endpoints with an injectable fetch/baseUrl for tests.
 */

import { buildMessageLink } from './link.js';
import { xDmsToLinks } from './archive/x-dms.js';
import {
  authHeaders,
  contentTarget,
  contentText,
  requestJson,
  resolveOption,
  codedError,
  unsupportedError,
} from './http.js';

const SOURCE = 'x';

const dmText = (event) =>
  event.text ?? event.message_create?.message_data?.text ?? event.body ?? '';

const isDmEvent = (item) =>
  item.event_type === 'MessageCreate' || Boolean(item.dm_conversation_id);

/** Map X media type string to our normalized attachment kind. */
const kindOf = (type) => {
  if (type === 'animated_gif') {
    return 'gif';
  }
  if (type === 'video') {
    return 'video';
  }
  return 'photo';
};

const xDmAttachments = (event) => {
  const media = event.message_create?.message_data?.attachment?.media;
  if (media) {
    return [
      {
        kind: kindOf(media.type),
        url: media.media_url_https ?? media.media_url ?? null,
      },
    ];
  }
  const keys = event.attachments?.media_keys ?? [];
  return keys.length > 0
    ? keys.map(() => ({ kind: 'photo', url: null }))
    : null;
};

const xPostAttachments = (post) => {
  const media = post.entities?.media ?? [];
  if (media.length > 0) {
    return media.map((m) => ({
      kind: kindOf(m.type),
      url: m.media_url_https ?? null,
    }));
  }
  const keys = post.attachments?.media_keys ?? [];
  return keys.length > 0
    ? keys.map(() => ({ kind: 'photo', url: null }))
    : null;
};

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
    replyTo:
      String(
        event.message_create?.message_data?.referenced_tweet_id ??
          event.reply_to?.id ??
          ''
      ) || null,
    attachments: xDmAttachments(event),
    raw: event,
  });

const xPostToLink = (post) =>
  buildMessageLink({
    source: SOURCE,
    externalId: String(post.id),
    sender: String(post.author_id ?? post.username ?? 'unknown'),
    chat: String(post.conversation_id ?? `post:${post.id}`),
    body: post.text ?? '',
    timestamp: post.created_at ?? null,
    replyTo:
      String(
        post.in_reply_to_tweet_id ??
          post.in_reply_to_status_id_str ??
          post.in_reply_to_user_id ??
          ''
      ) || null,
    attachments: xPostAttachments(post),
    raw: post,
  });

export const xUpdatesToLinks = (payload) => {
  const data = Array.isArray(payload) ? payload : (payload?.data ?? []);
  return data.map((item) =>
    isDmEvent(item) ? xDmToLink(item) : xPostToLink(item)
  );
};

// Without these X returns only id and event_type for a DM event (R-Z4).
const DM_FIELDS = {
  'dm_event.fields':
    'id,event_type,text,created_at,sender_id,dm_conversation_id,attachments,referenced_tweets,participant_ids',
  expansions:
    'sender_id,participant_ids,referenced_tweets.id,attachments.media_keys',
  'user.fields': 'username,name',
  'media.fields': 'type,url,preview_image_url',
};

const xDmRequest = (options, search) => {
  const dm = { ...search, ...DM_FIELDS };
  if (options.conversationId) {
    return {
      path: `/2/dm_conversations/${options.conversationId}/dm_events`,
      search: dm,
    };
  }
  if (options.participantId) {
    return {
      path: `/2/dm_conversations/with/${options.participantId}/dm_events`,
      search: dm,
    };
  }
  return { path: '/2/dm_events', search: dm };
};

/**
 * What to pull: the DMs, and separately the mentions of the saved user.
 * A saved user id never turns the DM pull into a mentions pull; a page
 * token belongs to one stream, so it pulls only that stream (R-Z4).
 */
const xPullRequests = (options, configuredUserId) => {
  const search = {
    max_results: options.limit ?? options.maxResults ?? 50,
    pagination_token: options.paginationToken ?? options.offset,
  };
  const userId = options.userId ?? configuredUserId;
  const mentions = () => {
    if (!userId) {
      throw codedError('X mentions need the user id', 'no-target');
    }
    return {
      kind: 'mentions',
      path: `/2/users/${userId}/mentions`,
      search: {
        ...search,
        'tweet.fields': 'created_at,author_id,conversation_id',
      },
    };
  };
  if (options.mode === 'mentions') {
    return [mentions()];
  }
  const dms = { kind: 'dms', ...xDmRequest(options, search) };
  const scoped =
    options.mode === 'dms' ||
    options.conversationId ||
    options.participantId ||
    search.pagination_token;
  return scoped || !userId ? [dms] : [dms, mentions()];
};

// A DM conversation id (`123` or `123-456`), as opposed to a post thread
// key such as `post:9` or `wall:self` (R-Z4).
const isDmConversationId = (value) => /^\d+(-\d+)?$/.test(String(value ?? ''));

// The endpoint a DM goes to: a conversation id, or a user to start one
// with. A post thread key is neither (R-Z4).
const xDmPath = (content, options) => {
  const object = typeof content === 'object' && content ? content : {};
  const chat = options.conversationId ?? object.conversationId ?? object.chat;
  const participant =
    options.participantId ?? object.participantId ?? object.to;
  if (isDmConversationId(chat)) {
    return `/2/dm_conversations/${chat}/messages`;
  }
  if (isDmConversationId(participant)) {
    return `/2/dm_conversations/with/${participant}/messages`;
  }
  throw codedError(
    `x chat "${chat ?? participant ?? ''}" is not a DM conversation; X has no API to reply to a post thread here`,
    'unsupported-chat'
  );
};

export const createXLive = ({
  token = null,
  userId = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://api.x.com',
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(override ?? token, 'X_ACCESS_TOKEN', 'X access token');
  const headers = (override) => authHeaders(resolvedToken(override));

  const adapter = {
    async pullMessages(options = {}) {
      const links = [];
      const raws = [];
      const failures = [];
      let nextOffset = null;
      const requests = xPullRequests(options, userId);
      for (const { kind, path, search } of requests) {
        try {
          const raw = await requestJson(fetchImpl, `${baseUrl}${path}`, {
            headers: headers(options.token),
            search,
          });
          links.push(...xUpdatesToLinks(raw));
          raws.push(raw);
          nextOffset ??= raw?.meta?.next_token ?? null;
        } catch (error) {
          if (requests.length === 1) {
            throw error;
          }
          failures.push({ stream: kind, error: error.message });
        }
      }
      return {
        links,
        rawCount: raws.reduce(
          (n, raw) => n + (Array.isArray(raw?.data) ? raw.data.length : 0),
          0
        ),
        nextOffset,
        raw: raws.length === 1 ? raws[0] : raws,
        ...(failures.length ? { failures } : {}),
      };
    },
    async deleteMessages({ ids, links } = {}, options = {}) {
      const messageIds = (
        ids ?? (links ?? []).map((l) => l.id?.split(':').pop())
      ).filter(Boolean);
      let count = 0;
      for (const id of messageIds) {
        await requestJson(fetchImpl, `${baseUrl}/2/dm_events/${id}`, {
          method: 'DELETE',
          headers: headers(options.token),
        });
        count += 1;
      }
      return { ok: true, deleted: count };
    },
    /**
     * Send a Direct Message. A chat key names a DM conversation (POST
     * /2/dm_conversations/:id/messages) or, with a user id, starts one
     * (/with/:participant_id/messages). It never publishes a post (R-Z4).
     */
    async sendMessage(content, options = {}) {
      const text = contentText(content);
      if (!text) {
        throw codedError('x message text is required', 'bad-draft');
      }
      const path = xDmPath(content, options);
      return requestJson(fetchImpl, `${baseUrl}${path}`, {
        method: 'POST',
        headers: headers(options.token),
        body: { text },
      });
    },
    /** The explicit, named action that publishes a public post (R-Z4). */
    async publishPost(content, options = {}) {
      const text = contentText(content);
      if (!text) {
        throw codedError('x post text is required', 'bad-draft');
      }
      return requestJson(fetchImpl, `${baseUrl}/2/tweets`, {
        method: 'POST',
        headers: headers(options.token),
        body: { text },
      });
    },
    /** Broadcast: a public post. Anything addressed to a chat is a DM. */
    async post(content, options = {}) {
      const addressed =
        options.conversationId ||
        options.participantId ||
        contentTarget(content) ||
        content?.conversationId ||
        content?.contact;
      return addressed
        ? adapter.sendMessage(content, options)
        : adapter.publishPost(content, options);
    },
    // The profile endpoint is v1.1 and needs an OAuth 1.0a user context;
    // a bearer token cannot call it, so it is reported, not attempted.
    async syncProfile() {
      throw unsupportedError(
        'X profile updates need OAuth 1.0a user-context credentials, which are not configured; edit the profile on x.com'
      );
    },
  };
  return adapter;
};

export const xSource = {
  name: SOURCE,
  async parseArchive(archive, ctx) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    if (obj.account) {
      if (ctx?.state) {
        ctx.state.self = obj.account;
      }
      return [];
    }
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
          raw: tw,
        })
      );
    }
    out.push(...(await xDmsToLinks(obj, ctx)));
    return out;
  },
  live: createXLive(),
};
