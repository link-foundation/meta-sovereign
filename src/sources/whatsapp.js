/**
 * WhatsApp source adapter (R-E4).
 *
 * Parses the `_chat.txt` text format produced by WhatsApp's per-chat
 * "Export chat" feature. Each line looks like:
 *   `[2026-04-30, 14:32:11] Alice: Hello!`
 *
 * The live adapter targets WhatsApp Cloud API: outbound text messages
 * go to `/{phone-number-id}/messages`, profile updates go to
 * `/{phone-number-id}/whatsapp_business_profile`, and inbound reads
 * normalize webhook payloads because Cloud API delivery is webhook-led.
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

const SOURCE = 'whatsapp';
const LINE = /^\[([^\]]+)\]\s+([^:]+):\s+(.*)$/;

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

export const whatsappWebhookToLinks = (payload) => {
  const links = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const businessPhone = value.metadata?.phone_number_id ?? 'business';
      for (const message of value.messages ?? []) {
        links.push(
          buildMessageLink({
            source: SOURCE,
            externalId: String(message.id),
            sender: String(message.from ?? 'unknown'),
            chat: String(message.from ?? businessPhone),
            body: messageBody(message),
            timestamp: message.timestamp ?? null,
          })
        );
      }
    }
  }
  return links;
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

  return {
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
      const to = options.to ?? contentTarget(content);
      const text = contentText(content);
      if (!to) {
        throw new Error('whatsapp post recipient is required');
      }
      if (!text) {
        throw new Error('whatsapp post text is required');
      }
      const phone = resolvedPhone(options.phoneNumberId);
      return requestJson(fetchImpl, `${baseUrl}/${phone}/messages`, {
        method: 'POST',
        headers: authHeaders(resolvedToken(options.token)),
        body: {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        },
      });
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
  async parseArchive(archive) {
    const text = typeof archive === 'string' ? archive : String(archive);
    const out = [];
    let counter = 0;
    let chatId = 'unknown';
    if (typeof archive === 'object' && archive?.chat) {
      chatId = String(archive.chat);
    }
    for (const raw of text.split(/\r?\n/)) {
      const m = raw.match(LINE);
      if (!m) {
        continue;
      }
      const [, ts, sender, body] = m;
      counter += 1;
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(counter),
          sender: sender.trim(),
          chat: chatId,
          body,
          timestamp: ts,
        })
      );
    }
    return out;
  },
  live: createWhatsAppCloudLive(),
};
