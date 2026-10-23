/**
 * career.habr.com source adapter (R-E7).
 *
 * The site has no public archive export. The adapter therefore models
 * a resume (`/resume`) as a single link and applications as messages
 * fed in via the live API once OAuth flow is wired up. For the
 * prototype it accepts a JSON object the caller has already scraped.
 * The live adapter is intentionally path-configurable because Habr
 * Career does not publish a stable public API contract.
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

const SOURCE = 'habr-career';

export const habrApplicationsToLinks = (payload) => {
  const records = payload?.applications ?? payload?.items ?? [];
  return records.map((m) =>
    buildMessageLink({
      source: SOURCE,
      externalId: String(m.id),
      sender: String(m.from ?? m.sender?.id ?? 'self'),
      chat: String(`vacancy:${m.vacancyId ?? m.vacancy?.id ?? 'unknown'}`),
      body: m.message ?? m.text ?? '',
      timestamp: m.createdAt ?? m.created_at ?? null,
    })
  );
};

export const createHabrCareerLive = ({
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://career.habr.com',
  applicationsPath = '/api/applications',
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(
      override ?? token,
      'HABR_CAREER_ACCESS_TOKEN',
      'Habr Career access token'
    );
  const headers = (override) => authHeaders(resolvedToken(override));

  return {
    async pullMessages(options = {}) {
      const raw = await requestJson(
        fetchImpl,
        `${baseUrl}${options.path ?? applicationsPath}`,
        {
          headers: headers(options.token),
          search: {
            page: options.page ?? options.offset,
            per_page: options.limit,
          },
        }
      );
      const links = habrApplicationsToLinks(raw);
      return {
        links,
        rawCount: raw?.items?.length ?? links.length,
        nextOffset: raw?.nextPage ?? raw?.next_page ?? null,
        raw,
      };
    },
    async post(content, options = {}) {
      const applicationId =
        options.applicationId ??
        threadTarget(content, 'application') ??
        content?.applicationId;
      const text = contentText(content);
      if (!applicationId) {
        throw new Error('habr-career application id is required');
      }
      if (!text) {
        throw new Error('habr-career message text is required');
      }
      return requestJson(
        fetchImpl,
        `${baseUrl}${applicationsPath}/${applicationId}/messages`,
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
        'Habr Career has no API to change a resume; use the CV sync screen, which drives the web site'
      );
    },
  };
};

const live = createHabrCareerLive();

export const habrCareerSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const m of obj.applications ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(m.id),
          sender: m.from ?? 'self',
          chat: `vacancy:${m.vacancyId}`,
          body: m.message ?? '',
          timestamp: m.createdAt,
        })
      );
    }
    return out;
  },
  live,
  syncResume: (resume, options) => live.syncResume(resume, options),
};
