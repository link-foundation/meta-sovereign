/**
 * hh.ru source adapter (R-E8).
 *
 * Uses the official common-chat API for current history and replies.
 * Deprecated negotiation reads remain an explicit compatibility protocol.
 * Resume changes use the browser CV plan, not an invented API endpoint.
 */

import { normalizeHhMessages } from './hh-messages.js';
import { pullHhChats } from './hh-chats.js';
import { sendHhChat } from './hh-chat-send.js';
import {
  authHeaders,
  threadTarget,
  unsupportedError,
  contentText,
  requestJson,
  resolveOption,
} from './http.js';

const SOURCE = 'hh';

export const hhNegotiationsToLinks = (payload) => normalizeHhMessages(payload);

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
      const apiBase = (options.baseUrl ?? baseUrl).replace(/\/$/u, '');
      if (!options.protocol || options.protocol === 'chats') {
        return pullHhChats({
          origin: new URL(apiBase).href,
          options,
          read: (path, search) =>
            requestJson(fetchImpl, `${apiBase}${path}`, {
              headers: headers(options.token),
              search,
              timeoutMs: options.timeout,
            }),
        });
      }
      if (options.protocol !== 'negotiations') {
        throw unsupportedError(
          'HH history protocol must be chats or negotiations'
        );
      }
      const raw = await requestJson(fetchImpl, `${apiBase}/negotiations`, {
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
      if (
        typeof negotiationId === 'string' &&
        negotiationId.startsWith('chat:')
      ) {
        return sendHhChat({
          fetchImpl,
          baseUrl: options.baseUrl ?? baseUrl,
          headers: headers(options.token),
          content,
          options,
          chatId: negotiationId.slice(5),
          text,
        });
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
    return normalizeHhMessages(obj, { legacyFlat: true });
  },
  live,
  syncResume: (resume, options) => live.syncResume(resume, options),
};
