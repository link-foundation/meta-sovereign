/**
 * WhatsApp source adapter (R-E4).
 *
 * Parses the text of WhatsApp's per-chat "Export chat" (Android and iOS
 * layouts, see ./whatsapp-archive.js; chat ids, see ./whatsapp-ids.js).
 *
 * The live adapter targets WhatsApp Cloud API: outbound text messages
 * go to `/{phone-number-id}/messages`, profile updates go to
 * `/{phone-number-id}/whatsapp_business_profile`, and inbound reads
 * normalize webhook payloads because Cloud API delivery is webhook-led.
 * Greeting stickers (issue #35) are `type: 'sticker'` messages carrying
 * an uploaded media id or a public `.webp` link; outside the 24-hour
 * customer-service window only approved templates may be sent.
 *
 * Issue #31 / PR #34: `setTyping` shows a typing indicator. Cloud API
 * ties typing indicators to the incoming message being answered (it
 * also marks that message read), so a `messageId` is required.
 */

import { buildMessageLink } from './link.js';
import {
  authHeaders,
  compact,
  contentTarget,
  contentText,
  requestJson,
  resolveOption,
  unsupportedError,
} from './http.js';
import { contentSticker } from './sticker.js';
import { parseWhatsAppArchive } from './whatsapp-archive.js';

const SOURCE = 'whatsapp';

const messageBody = (message) => {
  if (message.text?.body) {
    return message.text.body;
  }
  if (message.button?.text) {
    return message.button.text;
  }
  if (message.interactive?.button_reply?.title) {
    return message.interactive.button_reply.title;
  }
  return message.caption ?? message.body ?? '';
};

const webhookSticker = (message) =>
  message.type === 'sticker' && message.sticker
    ? { id: String(message.sticker.id), pack: null }
    : null;

/** Drop null/undefined keys so attachment objects only carry defined values. */
const omitNull = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)
  );

// Per-type attachment builders — each handles exactly one Cloud API message
// type so that `webhookAttachments` stays well below the complexity limit.

const waImageAtt = (img) =>
  omitNull({
    kind: 'photo',
    url: img?.url,
    mime: img?.mime_type,
    caption: img?.caption,
  });

const waVideoAtt = (vid) =>
  omitNull({
    kind: 'video',
    url: vid?.url,
    mime: vid?.mime_type,
    caption: vid?.caption,
  });

const waAudioAtt = (aud) =>
  omitNull({
    kind: aud?.voice === true ? 'voice' : 'audio',
    url: aud?.url,
    mime: aud?.mime_type,
    duration: aud?.duration,
  });

const waDocAtt = (doc) =>
  omitNull({
    kind: 'file',
    url: doc?.url,
    mime: doc?.mime_type,
    name: doc?.filename,
  });

const waStickerAtt = (st) =>
  omitNull({ kind: 'sticker', url: st?.url, mime: 'image/webp' });

const waLocationAtt = (loc) =>
  omitNull({
    kind: 'location',
    lat: loc?.latitude,
    lon: loc?.longitude,
    title: loc?.name,
  });

const webhookAttachments = (message) => {
  const t = message.type;
  if (t === 'image') {
    return [waImageAtt(message.image)];
  }
  if (t === 'video') {
    return [waVideoAtt(message.video)];
  }
  if (t === 'audio') {
    return [waAudioAtt(message.audio)];
  }
  if (t === 'document') {
    return [waDocAtt(message.document)];
  }
  if (t === 'sticker') {
    return [waStickerAtt(message.sticker)];
  }
  if (t === 'location') {
    return [waLocationAtt(message.location)];
  }
  if (t === 'contacts') {
    const items = (message.contacts ?? []).map((c) =>
      omitNull({ kind: 'contact', name: c.name?.formatted_name })
    );
    return items.length > 0 ? items : null;
  }
  return null;
};

const findSenderName = (contacts, from) => {
  const entry = (contacts ?? []).find((c) => c.wa_id === from);
  return entry?.profile?.name ?? null;
};

/**
 * Build a normalised link for a single inbound Cloud API message.
 * Extracted from `whatsappWebhookToLinks` to keep that function's
 * complexity below the project limit.
 */
const buildWebhookLink = (message, value, businessPhone) => {
  const forwardedFrom =
    message.context?.forwarded === true
      ? { id: message.context?.from ?? null }
      : null;
  return buildMessageLink({
    source: SOURCE,
    externalId: String(message.id),
    sender: String(message.from ?? 'unknown'),
    chat: String(message.from ?? businessPhone),
    body: messageBody(message),
    timestamp: message.timestamp ?? null,
    sticker: webhookSticker(message),
    replyTo: message.context?.id ?? null,
    forwardedFrom,
    attachments: webhookAttachments(message),
    senderName: findSenderName(value.contacts, message.from),
    raw: message,
    outgoing: false,
  });
};

export const whatsappWebhookToLinks = (payload) => {
  const links = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const businessPhone = value.metadata?.phone_number_id ?? 'business';
      for (const message of value.messages ?? []) {
        if (message.type === 'reaction') {
          continue;
        }
        links.push(buildWebhookLink(message, value, businessPhone));
      }
    }
  }
  return links;
};

/**
 * Extract reaction events from a Cloud API webhook payload.
 * Reaction messages are skipped by `whatsappWebhookToLinks`; callers
 * that need to apply emoji reactions to existing links use this helper.
 */
export const whatsappReactionsFromMessages = (payload) => {
  const out = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type === 'reaction' && message.reaction) {
          out.push({
            targetId: message.reaction.message_id,
            emoji: message.reaction.emoji,
          });
        }
      }
    }
  }
  return out;
};

/**
 * Normalize Cloud API `statuses` arrays into partial link updates.
 * Each update carries `{ id, delivery, at }` — callers merge delivery
 * state onto the matching stored link.
 */
export const whatsappStatusesToUpdates = (payload) => {
  const out = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        out.push({
          id: `msg:whatsapp:${status.id}`,
          delivery: status.status,
          at: status.timestamp,
        });
      }
    }
  }
  return out;
};

// A personal number has no official API: with no Cloud API credentials an
// automated send (greeting, rule, broadcast) is refused with `unsupported`
// instead of failing on a missing token or driving WhatsApp Web, whose
// terms forbid automated use. A send the user confirms may still go
// through the browser sender (R-Z9).
export const PERSONAL_AUTOMATION_MESSAGE =
  'WhatsApp: automated sends need the WhatsApp Business Cloud API; a personal WhatsApp account can only be sent to by hand (WhatsApp does not allow automation of the personal app)';

const refuseAutomatedPersonal = (options, token, phone) => {
  if (options.automated !== true) {
    return;
  }
  try {
    token(options.token);
    phone(options.phoneNumberId);
  } catch {
    throw unsupportedError(PERSONAL_AUTOMATION_MESSAGE);
  }
};

export const createWhatsAppCloudLive = ({
  token = null,
  phoneNumberId = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://graph.facebook.com/v22.0',
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(
      override ?? token,
      'WHATSAPP_ACCESS_TOKEN',
      'WhatsApp Cloud API access token'
    );
  const resolvedPhone = (override) =>
    resolveOption(
      override ?? phoneNumberId,
      'WHATSAPP_PHONE_NUMBER_ID',
      'WhatsApp phone number id'
    );

  const sendMessages = (body, options = {}) =>
    requestJson(
      fetchImpl,
      `${baseUrl}/${resolvedPhone(options.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: authHeaders(resolvedToken(options.token)),
        body: { messaging_product: 'whatsapp', ...body },
      }
    );

  return {
    async setTyping({ messageId } = {}, options = {}) {
      if (!messageId) {
        throw new Error(
          'whatsapp setTyping requires messageId (the incoming message being replied to)'
        );
      }
      return sendMessages(
        {
          status: 'read',
          message_id: messageId,
          typing_indicator: { type: 'text' },
        },
        options
      );
    },
    async markRead({ id, link } = {}, options = {}) {
      const messageId = id ?? link?.id?.split(':').pop();
      if (!messageId) {
        throw new Error('whatsapp markRead requires a message id');
      }
      return sendMessages({ status: 'read', message_id: messageId }, options);
    },
    async react({ chat, id, emoji, link } = {}, options = {}) {
      const messageId = id ?? link?.id?.split(':').pop();
      const to = chat ?? link?.chat;
      if (!messageId || !to) {
        throw new Error('whatsapp react requires a message id and its chat');
      }
      // A reaction is a message to the chat's person (Cloud API).
      return sendMessages(
        {
          recipient_type: 'individual',
          to: String(to),
          type: 'reaction',
          reaction: { message_id: messageId, emoji: emoji ?? '' },
        },
        options
      );
    },
    async pullMessages(options = {}) {
      const payload =
        options.webhookPayload ?? options.payload ?? options.updates ?? null;
      const links = payload ? whatsappWebhookToLinks(payload) : [];
      return {
        links,
        rawCount: links.length,
        nextOffset: null,
        raw: payload,
      };
    },
    async post(content, options = {}) {
      refuseAutomatedPersonal(options, resolvedToken, resolvedPhone);
      const to = options.to ?? contentTarget(content);
      const text = contentText(content);
      const sticker = contentSticker(content);
      if (!to) {
        throw new Error('whatsapp post recipient is required');
      }
      if (!text && !sticker) {
        throw new Error('whatsapp post text or sticker is required');
      }
      const message = sticker
        ? {
            type: 'sticker',
            sticker: sticker.id ? { id: sticker.id } : { link: sticker.url },
          }
        : { type: 'text', text: { body: text } };
      return sendMessages({ to, ...message }, options);
    },
    async syncProfile(profile, options = {}) {
      const phone = resolvedPhone(options.phoneNumberId);
      return requestJson(
        fetchImpl,
        `${baseUrl}/${phone}/whatsapp_business_profile`,
        {
          method: 'POST',
          headers: authHeaders(resolvedToken(options.token)),
          body: {
            messaging_product: 'whatsapp',
            ...compact({
              about: profile.about ?? profile.status,
              address: profile.address,
              description: profile.description ?? profile.bio,
              email: profile.email,
              vertical: profile.vertical,
              websites: profile.websites,
            }),
          },
        }
      );
    },
  };
};

export const whatsappSource = {
  name: SOURCE,
  // Both export layouts, any date order, zip media names (R-Z9).
  async parseArchive(archive) {
    return parseWhatsAppArchive(archive);
  },
  live: createWhatsAppCloudLive(),
};
