/**
 * Facebook source adapter (R-E5).
 *
 * Reads `messages/inbox/<thread>/message_*.json|html` files from Facebook's
 * and Instagram's download-your-data archives (R-Z10: mojibake repaired,
 * media copied, collision-free ids; see ./archive/meta-thread.js).
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
import { contentSticker } from './sticker.js';
import { createArchiveContext } from './archive/context.js';
import { metaHtmlToLinks, metaJsonToLinks } from './archive/meta-thread.js';

const SOURCE = 'facebook';

// Per-type attachment builders — split out so `fbAttachmentItem` stays
// under the cyclomatic-complexity limit.

const fbImageAtt = (payload) => ({ kind: 'photo', url: payload?.url ?? null });
const fbVideoAtt = (payload) => ({ kind: 'video', url: payload?.url ?? null });
const fbAudioAtt = (payload) => ({ kind: 'audio', url: payload?.url ?? null });
const fbFileAtt = (payload) => ({
  kind: 'file',
  url: payload?.url ?? null,
  name: payload?.name ?? null,
});
const fbLocationAtt = (payload) => ({
  kind: 'location',
  lat: payload?.coordinates?.lat ?? null,
  lon: payload?.coordinates?.long ?? null,
  title: payload?.title ?? null,
});

/** Map a single Messenger attachment object to our normalized shape. */
const fbAttachmentItem = (att) => {
  if (att.type === 'image') {
    return fbImageAtt(att.payload);
  }
  if (att.type === 'video') {
    return fbVideoAtt(att.payload);
  }
  if (att.type === 'audio') {
    return fbAudioAtt(att.payload);
  }
  if (att.type === 'file') {
    return fbFileAtt(att.payload);
  }
  if (att.type === 'location') {
    return fbLocationAtt(att.payload);
  }
  return null;
};

const fbAttachments = (message) => {
  const items = (message.attachments ?? [])
    .map(fbAttachmentItem)
    .filter(Boolean);
  return items.length > 0 ? items : null;
};

// Field helpers for `graphMessageToLink` — split out to keep the
// function's cyclomatic complexity below the project limit.

const fbExternalId = (message) =>
  String(message.id ?? message.mid ?? message.timestamp);

const fbSenderId = (message) =>
  String(message.from?.id ?? message.sender?.id ?? 'unknown');

const fbChatId = (message, conversationId) =>
  String(conversationId ?? message.thread_id ?? message.recipient?.id);

const fbReplyTo = (message) =>
  message.reply_to?.mid ?? message.reply_to?.id ?? null;

const graphMessageToLink = (message, conversationId = null) =>
  buildMessageLink({
    source: SOURCE,
    externalId: fbExternalId(message),
    sender: fbSenderId(message),
    chat: fbChatId(message, conversationId),
    body: message.message ?? message.text ?? '',
    timestamp: message.created_time ?? message.timestamp ?? null,
    raw: message,
    replyTo: fbReplyTo(message),
    senderName: message.from?.name ?? null,
    sticker: message.sticker_id
      ? { id: String(message.sticker_id), pack: null }
      : null,
    attachments: fbAttachments(message),
    deleted: message.is_deleted === true ? true : null,
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

/**
 * Extract delivery/read receipt events from a Messenger webhook payload.
 * These are not full message links but partial update objects carrying
 * `{ id, delivery }` that callers merge onto stored links.
 */
export const facebookDeliveryFromWebhook = (payload) => {
  const out = [];
  for (const entry of payload?.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (event.delivery !== null && event.delivery !== undefined) {
        out.push({
          id: `msg:facebook:delivery:${event.sender?.id}`,
          delivery: 'delivered',
        });
      }
      if (event.read !== null && event.read !== undefined) {
        out.push({
          id: `msg:facebook:read:${event.sender?.id}`,
          delivery: 'read',
        });
      }
    }
  }
  return out;
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
    async markRead({ chat, link } = {}, options = {}) {
      const page = resolvedPage(options.pageId);
      const psid = chat ?? link?.chat ?? link?.sender;
      if (!psid) {
        throw new Error(
          'facebook markRead requires psid (chat, link.chat, or link.sender)'
        );
      }
      return requestJson(fetchImpl, `${baseUrl}/${page}/messages`, {
        method: 'POST',
        headers: headers(options.token),
        body: { recipient: { id: psid }, sender_action: 'mark_seen' },
      });
    },
    async post(content, options = {}) {
      const page = resolvedPage(options.pageId);
      const to = options.to ?? contentTarget(content);
      const text = contentText(content);
      // Messenger sends public first-party stickers by id (issue #35).
      const sticker = contentSticker(content);
      if (!to) {
        throw new Error('facebook post recipient id is required');
      }
      if (!text && !sticker?.id) {
        throw new Error('facebook post text or sticker is required');
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
          message: sticker?.id ? { sticker_id: Number(sticker.id) } : { text },
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

/**
 * Messenger / Instagram archive entries (R-Z10). The JSON form has its
 * latin-1 mojibake repaired; the HTML form is read too. A path under an
 * Instagram export folder yields `instagram` links.
 */
const isInstagramPath = (name) => /instagram/i.test(String(name ?? ''));

const parseMetaArchive = async (archive, ctx) => {
  const network = isInstagramPath(ctx?.entryName) ? 'instagram' : SOURCE;
  const archiveCtx = ctx?.ordinal ? ctx : createArchiveContext({ network });
  const args = { network, ctx: archiveCtx, entryName: ctx?.entryName };
  if (typeof archive === 'string' && /^\s*</.test(archive)) {
    return metaHtmlToLinks({ ...args, html: archive });
  }
  return metaJsonToLinks({ ...args, archive });
};

export const facebookSource = {
  name: SOURCE,
  parseArchive: parseMetaArchive,
  live: createFacebookLive(),
};
