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
import { createArchiveContext } from './archive/context.js';
import { linkedinDate, shortHash } from './archive/text.js';
import { withLegacy } from './archive/legacy.js';
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

const names = (text) =>
  String(text ?? '')
    .split(/[,;]\s*/)
    .map((n) => n.trim())
    .filter(Boolean);

const attachmentUrls = (text) =>
  String(text ?? '')
    .split(/[\s,;]+/)
    .filter((u) => /^https?:\/\//i.test(u))
    .map((url) => ({ kind: 'file', url, name: url.split('/').pop() || null }));

// Header spellings: "CONVERSATION ID", conversation_id, from, date…
const ALIASES = { CONVERSATION: 'CONVERSATION_ID', ID: 'CONVERSATION_ID' };

const normalizedRow = (row) => {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const name = key.trim().toUpperCase().replace(/\s+/g, '_');
    out[ALIASES[name] ?? name] = value;
  }
  return out;
};

const peopleOf = (row, from) => {
  const to = names(row.TO);
  return {
    chatName: row.CONVERSATION_TITLE || row.SUBJECT || null,
    chatType: to.length > 1 ? 'group' : 'private',
    participants: [...new Set([from, ...to])].filter(Boolean),
  };
};

const archiveRowToLink = (raw, ctx) => {
  const row = normalizedRow(raw);
  const conversation = row.CONVERSATION_ID || null;
  const from = row.FROM || null;
  const iso = linkedinDate(row.DATE);
  const sender = row.SENDER_PROFILE_URL || from;
  const n = ctx.ordinal(`${conversation}|${iso}|${sender}`);
  const folder = String(row.FOLDER ?? '').toLowerCase();
  const link = buildMessageLink({
    source: SOURCE,
    externalId: `${conversation}:${iso || row.DATE}:${shortHash(sender)}:${n}`,
    sender,
    chat: conversation,
    body: row.CONTENT || row.SUBJECT || '',
    timestamp: iso ?? (row.DATE || null),
    senderName: from,
    ...peopleOf(row, from),
    outgoing: folder ? folder === 'sent' : null,
    folder: folder || null,
    attachments: attachmentUrls(row.ATTACHMENTS),
    raw: { id: conversation, date: row.DATE || null },
  });
  // An older build called it `<conversation>-<date text>`.
  return withLegacy(link, {
    id: `msg:linkedin:${conversation}-${row.DATE}`,
    sender: from,
    chat: conversation,
  });
};

const live = createLinkedInLive();

export const linkedinSource = {
  name: SOURCE,
  async parseArchive(archive, ctx) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const shared = ctx?.ordinal
      ? ctx
      : createArchiveContext({ network: SOURCE });
    return (obj.messages ?? []).map((row) => archiveRowToLink(row, shared));
  },
  live,
  syncResume: (resume, options) => live.syncResume(resume, options),
};
