/**
 * hh.ru source adapter (R-E8).
 *
 * Wraps the official hh.ru API (https://api.hh.ru) for resume
 * read/write and message threads on vacancy responses. Archive import
 * accepts pre-fetched JSON; the live adapter talks to negotiations and
 * resume endpoints with injectable fetch/baseUrl for tests.
 */

import { buildMessageLink } from './link.js';
import {
  authHeaders,
  threadTarget,
  unsupportedError,
  contentText,
  requestJson,
  resolveOption,
} from './http.js';

const SOURCE = 'hh';

const negotiationMessages = (negotiation) => {
  const messages = negotiation.messages?.items ?? negotiation.messages ?? [];
  return messages.length > 0 ? messages : [negotiation];
};

const negotiationSender = (message, negotiation) =>
  String(
    message.author?.id ?? message.from ?? negotiation.employer?.id ?? 'unknown'
  );

const negotiationChat = (message, negotiation) =>
  String(
    negotiation.id ??
      `vacancy:${message.vacancy?.id ?? negotiation.vacancy?.id ?? 'unknown'}`
  );

const negotiationToLinks = (negotiation) => {
  const records = negotiationMessages(negotiation);
  return records.map((message) =>
    buildMessageLink({
      source: SOURCE,
      externalId: String(message.id ?? negotiation.id),
      sender: negotiationSender(message, negotiation),
      chat: negotiationChat(message, negotiation),
      body: message.text ?? message.message ?? negotiation.text ?? '',
      timestamp:
        message.created_at ??
        message.createdAt ??
        negotiation.created_at ??
        null,
    })
  );
};

export const hhNegotiationsToLinks = (payload) => {
  const items = payload?.items ?? payload?.negotiations ?? [];
  return items.flatMap(negotiationToLinks);
};

export const createHhLive = ({
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://api.hh.ru',
  userAgent = 'meta-sovereign',
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(override ?? token, 'HH_ACCESS_TOKEN', 'hh.ru access token');
  const headers = (override) => ({
    ...authHeaders(resolvedToken(override)),
    'User-Agent': userAgent,
  });

  return {
    async pullMessages(options = {}) {
      const raw = await requestJson(fetchImpl, `${baseUrl}/negotiations`, {
        headers: headers(options.token),
        search: {
          page: options.page ?? options.offset,
          per_page: options.limit ?? 20,
          status: options.status,
        },
      });
      const links = hhNegotiationsToLinks(raw);
      return {
        links,
        rawCount: raw?.items?.length ?? links.length,
        nextOffset:
          raw?.pages && raw.page + 1 < raw.pages ? raw.page + 1 : null,
        raw,
      };
    },
    async post(content, options = {}) {
      const negotiationId =
        options.negotiationId ??
        threadTarget(content, 'negotiation') ??
        content?.negotiationId;
      const text = contentText(content);
      if (!negotiationId) {
        throw new Error('hh negotiation id is required');
      }
      if (!text) {
        throw new Error('hh message text is required');
      }
      return requestJson(
        fetchImpl,
        `${baseUrl}/negotiations/${negotiationId}/messages`,
        {
          method: 'POST',
          headers: headers(options.token),
          body: { message: text },
        }
      );
    },
    // No endpoint writes an applicant's resume (the CV plan researched
    // this, R-V6): report it instead of calling a URL that does not
    // exist. The CV sync screen drives the web site (R-Z4).
    async syncResume() {
      throw unsupportedError(
        'hh.ru has no API to change a resume; use the CV sync screen, which drives the web site'
      );
    },
  };
};

const live = createHhLive();

export const hhSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const m of obj.negotiations ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(m.id),
          sender: m.author?.id ?? 'unknown',
          chat: `vacancy:${m.vacancy?.id}`,
          body: m.text ?? '',
          timestamp: m.created_at,
        })
      );
    }
    return out;
  },
  live,
  syncResume: (resume, options) => live.syncResume(resume, options),
};
