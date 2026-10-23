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
  contentTarget,
  requestJson,
  resolveOption,
  unsupportedError,
} from './http.js';

const SOURCE = 'linkedin';

const postBody = (post) =>
  post.commentary ??
  post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary
    ?.text ??
  post.text ??
  post.body ??
  '';

const postRaw = (post) => ({
  id: post.id ?? post.urn ?? null,
  author: post.author ?? null,
  lifecycleState: post.lifecycleState ?? null,
});

const postEdited = (post) =>
  post.lastModifiedAt && post.lastModifiedAt !== post.createdAt
    ? post.lastModifiedAt
    : null;

const linkedinPostToLink = (post, fallbackAuthor = 'unknown') =>
  buildMessageLink({
    source: SOURCE,
    externalId: String(post.id ?? post.urn ?? post.entity),
    sender: String(post.author ?? fallbackAuthor),
    chat: String(`feed:${post.author ?? fallbackAuthor}`),
    body: postBody(post),
    timestamp:
      post.createdAt ?? post.publishedAt ?? post.lastModifiedAt ?? null,
    raw: postRaw(post),
    senderName: post.authorName ?? null,
    edited: postEdited(post),
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

const requireShareAsPost = (options, what) => {
  if (options.shareAsPost !== true) {
    throw unsupportedError(
      `LinkedIn has no API to edit the ${what}; pass shareAsPost to publish it as a public post instead`
    );
  }
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
    /**
     * A message to a person or chat. LinkedIn's messaging API is
     * partner-only, so this never sends: the sender falls back to the web
     * app. It must never turn a message into a public post (R-Z4).
     */
    async sendMessage() {
      throw unsupportedError(
        'LinkedIn messaging has no API for personal apps; send it from the LinkedIn web app'
      );
    },
    /**
     * Publish a PUBLIC feed post (broadcast). Anything addressed to a
     * chat or person is refused instead of being published (R-Z4).
     */
    async post(content, options = {}) {
      if (contentTarget(content) || content?.contact || options.to) {
        return adapter.sendMessage();
      }
      return adapter.publishPost(content, options);
    },
    /** The explicit, named action that publishes on the feed (R-Z4). */
    async publishPost(content, options = {}) {
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
    // Profile and resume edits have no API; sharing the text as a public
    // post happens only when the user chose "share as post" (R-Z4).
    async syncProfile(profile, options = {}) {
      requireShareAsPost(options, 'profile');
      const text = [
        profile.name,
        profile.headline,
        profile.about ?? profile.description,
      ]
        .filter(Boolean)
        .join('\n\n');
      return adapter.publishPost({ text }, options);
    },
    async syncResume(resume, options = {}) {
      requireShareAsPost(options, 'resume');
      const text = [
        resume.title ?? resume.headline ?? 'Resume',
        resume.summary ?? resume.about ?? resume.description,
        ...(resume.skills ?? []).map((skill) => `#${skill}`),
      ]
        .filter(Boolean)
        .join('\n\n');
      return adapter.publishPost({ text }, options);
    },
  };
  return adapter;
};

const archiveRowToLink = (row) =>
  buildMessageLink({
    source: SOURCE,
    externalId: row.CONVERSATION_ID
      ? `${row.CONVERSATION_ID}-${row.DATE}`
      : String(row.id),
    sender: row.FROM ?? row.from,
    chat: row.CONVERSATION_ID ?? row.conversation,
    body: row.CONTENT ?? row.content ?? '',
    timestamp: row.DATE ?? row.date,
    senderName: row.FROM ?? row.from ?? null,
    chatName: row.CONVERSATION_TITLE ?? row.conversation_title ?? null,
    raw: {
      id: row.CONVERSATION_ID ?? row.id ?? null,
      date: row.DATE ?? row.date ?? null,
    },
  });

const live = createLinkedInLive();

export const linkedinSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    return (obj.messages ?? []).map(archiveRowToLink);
  },
  live,
  syncResume: (resume, options) => live.syncResume(resume, options),
};
