/**
 * superjob.ru source adapter (R-E9).
 *
 * Accepts a pre-fetched JSON archive of resumes + vacancy responses
 * (the public API at api.superjob.ru returns this shape). The live side
 * wraps API reads/writes with token/app-id headers and injectable fetch
 * for testability.
 */

import { buildMessageLink } from './link.js';
import {
  authHeaders,
  contentTarget,
  contentText,
  requestJson,
  resolveOption,
} from './http.js';

const SOURCE = 'superjob';

export const superjobResponsesToLinks = (payload) => {
  const records = payload?.objects ?? payload?.responses ?? [];
  return records.map((m) =>
    buildMessageLink({
      source: SOURCE,
      externalId: String(m.id),
      sender: String(m.from ?? m.sender?.id ?? 'self'),
      chat: String(`vacancy:${m.vacancy_id ?? m.vacancy?.id ?? 'unknown'}`),
      body: m.message ?? m.text ?? '',
      timestamp: m.date ?? m.created_at ?? null,
    })
  );
};

export const createSuperjobLive = ({
  token = null,
  appId = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://api.superjob.ru/2.0',
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(
      override ?? token,
      'SUPERJOB_ACCESS_TOKEN',
      'SuperJob access token'
    );
  const resolvedAppId = (override) =>
    resolveOption(override ?? appId, 'SUPERJOB_APP_ID', 'SuperJob app id');
  const headers = (options = {}) => ({
    ...authHeaders(resolvedToken(options.token)),
    'X-Api-App-Id': resolvedAppId(options.appId),
  });

  return {
    async pullMessages(options = {}) {
      const raw = await requestJson(fetchImpl, `${baseUrl}/user_responses/`, {
        headers: headers(options),
        search: { page: options.page ?? options.offset, count: options.limit },
      });
      const links = superjobResponsesToLinks(raw);
      return {
        links,
        rawCount: raw?.objects?.length ?? links.length,
        nextOffset: raw?.more
          ? Number(options.page ?? options.offset ?? 0) + 1
          : null,
        raw,
      };
    },
    async post(content, options = {}) {
      const responseId =
        options.responseId ?? contentTarget(content) ?? content?.responseId;
      const text = contentText(content);
      if (!responseId) {
        throw new Error('superjob response id is required');
      }
      if (!text) {
        throw new Error('superjob message text is required');
      }
      return requestJson(
        fetchImpl,
        `${baseUrl}/user_responses/${responseId}/messages/`,
        {
          method: 'POST',
          headers: headers(options),
          body: { message: text },
        }
      );
    },
    async syncResume(resume, options = {}) {
      const resumeId = options.resumeId ?? resume.id ?? resume.resumeId;
      const method = resumeId ? 'PUT' : 'POST';
      const path = resumeId ? `/user_cvs/${resumeId}/` : '/user_cvs/';
      return requestJson(fetchImpl, `${baseUrl}${path}`, {
        method,
        headers: headers(options),
        body: resume,
      });
    },
  };
};

const live = createSuperjobLive();

export const superjobSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const m of obj.responses ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(m.id),
          sender: m.from ?? 'self',
          chat: `vacancy:${m.vacancy_id}`,
          body: m.message ?? '',
          timestamp: m.date,
        })
      );
    }
    return out;
  },
  live,
  syncResume: (resume, options) => live.syncResume(resume, options),
};
