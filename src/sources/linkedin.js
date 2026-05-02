/**
 * LinkedIn source adapter (R-E6).
 *
 * Parses the CSVs in LinkedIn's data export — at minimum
 * `messages.csv` and `Profile.csv` — represented here as already-parsed
 * arrays of records (callers wrap the CSV reader of their choice).
 * The live side wraps LinkedIn's REST Posts API so profile/resume
 * updates can be exported as posts and API-side post imports can be
 * normalized back into unified links.
 */

import { buildMessageLink } from './link.js';
import {
  authHeaders,
  contentText,
  requestJson,
  resolveOption,
} from './http.js';

const SOURCE = 'linkedin';

const postBody = (post) =>
  post.commentary ??
  post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary
    ?.text ??
  post.text ??
  post.body ??
  '';

const linkedinPostToLink = (post, fallbackAuthor = 'unknown') =>
  buildMessageLink({
    source: SOURCE,
    externalId: String(post.id ?? post.urn ?? post.entity),
    sender: String(post.author ?? fallbackAuthor),
    chat: String(`feed:${post.author ?? fallbackAuthor}`),
    body: postBody(post),
    timestamp:
      post.createdAt ?? post.publishedAt ?? post.lastModifiedAt ?? null,
  });

export const linkedinPostsToLinks = (payload, fallbackAuthor = 'unknown') => {
  let records = [];
  if (Array.isArray(payload)) {
    records = payload;
  } else if (payload?.elements) {
    records = payload.elements;
  } else if (payload?.results) {
    records = Object.values(payload.results);
  } else if (payload?.data) {
    records = payload.data;
  }
  return records.map((post) => linkedinPostToLink(post, fallbackAuthor));
};

export const createLinkedInLive = ({
  token = null,
  author = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://api.linkedin.com',
  linkedinVersion = '202604',
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(
      override ?? token,
      'LINKEDIN_ACCESS_TOKEN',
      'LinkedIn access token'
    );
  const resolvedAuthor = (override) =>
    resolveOption(
      override ?? author,
      'LINKEDIN_AUTHOR_URN',
      'LinkedIn author URN'
    );
  const headers = (override) => ({
    ...authHeaders(resolvedToken(override)),
    'X-Restli-Protocol-Version': '2.0.0',
    'Linkedin-Version': linkedinVersion,
  });

  const adapter = {
    async pullMessages(options = {}) {
      const owner = options.author ?? author;
      if (options.records) {
        const links = linkedinPostsToLinks(options.records, owner);
        return {
          links,
          rawCount: links.length,
          nextOffset: null,
          raw: options.records,
        };
      }
      let raw;
      if (options.postUrns?.length) {
        const ids = options.postUrns.join(',');
        raw = await requestJson(fetchImpl, `${baseUrl}/rest/posts`, {
          headers: {
            ...headers(options.token),
            'X-RestLi-Method': 'BATCH_GET',
          },
          search: { ids: `List(${ids})` },
        });
      } else {
        const authorUrn = resolvedAuthor(owner);
        raw = await requestJson(fetchImpl, `${baseUrl}/rest/posts`, {
          headers: headers(options.token),
          search: {
            q: 'author',
            author: authorUrn,
            count: options.limit ?? 20,
            start: options.offset,
          },
        });
      }
      const links = linkedinPostsToLinks(raw, owner);
      return {
        links,
        rawCount: raw?.elements?.length ?? links.length,
        nextOffset:
          raw?.paging?.links?.find((link) => link.rel === 'next')?.href ?? null,
        raw,
      };
    },
    async post(content, options = {}) {
      const owner = resolvedAuthor(options.author);
      const text = contentText(content);
      if (!text) {
        throw new Error('linkedin post text is required');
      }
      return requestJson(fetchImpl, `${baseUrl}/rest/posts`, {
        method: 'POST',
        headers: headers(options.token),
        body: {
          author: owner,
          commentary: text,
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        },
      });
    },
    async syncProfile(profile, options = {}) {
      const text = [
        profile.name,
        profile.headline,
        profile.about ?? profile.description,
      ]
        .filter(Boolean)
        .join('\n\n');
      return adapter.post({ text }, options);
    },
    async syncResume(resume, options = {}) {
      const text = [
        resume.title ?? resume.headline ?? 'Resume',
        resume.summary ?? resume.about ?? resume.description,
        ...(resume.skills ?? []).map((skill) => `#${skill}`),
      ]
        .filter(Boolean)
        .join('\n\n');
      return adapter.post({ text }, options);
    },
  };
  return adapter;
};

const live = createLinkedInLive();

export const linkedinSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const row of obj.messages ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: row.CONVERSATION_ID
            ? `${row.CONVERSATION_ID}-${row.DATE}`
            : String(row.id),
          sender: row.FROM ?? row.from,
          chat: row.CONVERSATION_ID ?? row.conversation,
          body: row.CONTENT ?? row.content ?? '',
          timestamp: row.DATE ?? row.date,
        })
      );
    }
    return out;
  },
  live,
  syncResume: (resume, options) => live.syncResume(resume, options),
};
