/**
 * Facebook source adapter (R-E5).
 *
 * Reads `messages/inbox/<thread>/message_*.json` files from Facebook's
 * download-your-data archive (UTF-8 form, not the mojibake one).
 * The live side targets Messenger Platform / Graph API page messaging:
 * pull page conversations, normalize webhook events, send text replies,
 * and update page profile metadata when credentials permit it.
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

const SOURCE = 'facebook';

const graphMessageToLink = (message, conversationId = null) =>
  buildMessageLink({
    source: SOURCE,
    externalId: String(message.id ?? message.mid ?? message.timestamp),
    sender: String(message.from?.id ?? message.sender?.id ?? 'unknown'),
    chat: String(conversationId ?? message.thread_id ?? message.recipient?.id),
    body: message.message ?? message.text ?? '',
    timestamp: message.created_time ?? message.timestamp ?? null,
  });

export const facebookWebhookToLinks = (payload) => {
  const links = [];
  for (const entry of payload?.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (!event.message) {
        continue;
      }
      links.push(
        graphMessageToLink(
          {
            ...event.message,
            sender: event.sender,
            recipient: event.recipient,
            timestamp: event.timestamp,
          },
          event.sender?.id
        )
      );
    }
  }
  return links;
};

export const facebookConversationsToLinks = (payload) => {
  const links = [];
  for (const conversation of payload?.data ?? payload?.conversations ?? []) {
    const messages = conversation.messages?.data ?? conversation.messages ?? [];
    for (const message of messages) {
      links.push(graphMessageToLink(message, conversation.id));
    }
  }
  return links;
};

export const createFacebookLive = ({
  token = null,
  pageId = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://graph.facebook.com/v22.0',
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(
      override ?? token,
      'FACEBOOK_PAGE_ACCESS_TOKEN',
      'Facebook page access token'
    );
  const resolvedPage = (override) =>
    resolveOption(override ?? pageId, 'FACEBOOK_PAGE_ID', 'Facebook page id');
  const headers = (override) => authHeaders(resolvedToken(override));

  return {
    async pullMessages(options = {}) {
      if (options.webhookPayload ?? options.payload) {
        const raw = options.webhookPayload ?? options.payload;
        const links = facebookWebhookToLinks(raw);
        return { links, rawCount: links.length, nextOffset: null, raw };
      }
      const page = resolvedPage(options.pageId);
      const raw = await requestJson(
        fetchImpl,
        `${baseUrl}/${page}/conversations`,
        {
          headers: headers(options.token),
          search: {
            fields:
              options.fields ??
              'messages.limit(50){id,message,created_time,from,to}',
            limit: options.limit ?? 25,
            after: options.offset ?? options.after,
          },
        }
      );
      const links = facebookConversationsToLinks(raw);
      return {
        links,
        rawCount: raw?.data?.length ?? links.length,
        nextOffset: raw?.paging?.cursors?.after ?? null,
        raw,
      };
    },
    async post(content, options = {}) {
      const page = resolvedPage(options.pageId);
      const to = options.to ?? contentTarget(content);
      const text = contentText(content);
      if (!to) {
        throw new Error('facebook post recipient id is required');
      }
      if (!text) {
        throw new Error('facebook post text is required');
      }
      return requestJson(fetchImpl, `${baseUrl}/${page}/messages`, {
        method: 'POST',
        headers: headers(options.token),
        body: {
          messaging_type:
            options.messagingType ??
            (content && typeof content === 'object'
              ? content.messagingType
              : undefined) ??
            'RESPONSE',
          recipient: { id: to },
          message: { text },
        },
      });
    },
    async syncProfile(profile, options = {}) {
      const page = resolvedPage(options.pageId);
      return requestJson(fetchImpl, `${baseUrl}/${page}`, {
        method: 'POST',
        headers: headers(options.token),
        body: compact({
          about: profile.about ?? profile.description,
          description: profile.description,
          website: profile.website ?? profile.url,
          emails: profile.email ? [profile.email] : undefined,
        }),
      });
    },
  };
};

export const facebookSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    const chatId = obj.thread_path ?? obj.title ?? 'unknown';
    for (const m of obj.messages ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(
            m.timestamp_ms ?? `${m.sender_name}-${m.timestamp}`
          ),
          sender: m.sender_name,
          chat: chatId,
          body: m.content ?? '',
          timestamp: m.timestamp_ms,
        })
      );
    }
    return out;
  },
  live: createFacebookLive(),
};
