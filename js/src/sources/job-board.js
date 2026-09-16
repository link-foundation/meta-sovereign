/**
 * Factory for browser-only job-board adapters (R-E11..R-E13).
 *
 * Naukri, VietnamWorks and TopCV publish no candidate-facing message
 * or resume API: their recruiter inboxes and profile editors are only
 * reachable from an authenticated browser session. Rather than invent
 * endpoints we cannot verify, these adapters
 *
 *   - parse the export/notification dumps the boards do hand out (or a
 *     scrape produced by the CV plans), and
 *   - route every live operation to the declarative CV plans in
 *     `js/src/cv`, which drive a real browser through browser-commander
 *     and record telemetry for each step.
 *
 * One factory serves all three boards, so a fix to the archive parser
 * or to the browser fallback lands on every board at once.
 */

import { buildMessageLink } from './link.js';
import { withCvPlatform, writeSourceCv } from './cv-bridge.js';

/**
 * Raised when a caller asks a browser-only board for an API-only
 * capability. Carries `code` so callers can branch without matching on
 * the message text.
 */
export class BrowserOnlySourceError extends Error {
  constructor(source, capability, hint) {
    super(
      `${source} exposes no public ${capability} API; ` +
        `use the browser-driven CV plan instead (${hint})`
    );
    this.name = 'BrowserOnlySourceError';
    this.code = 'browser-only-source';
    this.source = source;
    this.capability = capability;
  }
}

/** Field aliases seen across the boards' export dumps. */
const DEFAULT_ALIASES = {
  externalId: ['id', 'messageId', 'message_id', 'threadId', 'thread_id'],
  sender: ['from', 'sender', 'senderName', 'recruiter', 'company', 'employer'],
  chat: ['chat', 'conversationId', 'conversation_id', 'jobId', 'job_id'],
  body: ['message', 'body', 'text', 'content', 'description'],
  timestamp: ['date', 'timestamp', 'createdAt', 'created_at', 'sentAt', 'time'],
};

const pick = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
};

const parsed = (archive) =>
  typeof archive === 'string' ? JSON.parse(archive) : (archive ?? {});

/** Rows of the first collection the dump actually contains. */
const rowsOf = (obj, collections) => {
  for (const key of collections) {
    const rows = obj?.[key];
    if (Array.isArray(rows)) {
      return rows;
    }
  }
  return [];
};

/**
 * Flatten a conversation-shaped row into its messages, inheriting the
 * conversation's id and counterpart when a message omits them.
 */
const messagesOf = (row) =>
  Array.isArray(row?.messages)
    ? row.messages.map((message) => ({
        ...row,
        messages: undefined,
        ...message,
      }))
    : [row];

/**
 * Convert a job-board export dump into unified message links.
 * @param {string} source registry name
 * @param {object|string} archive dump (JSON text or parsed object)
 * @param {object} [options]
 * @param {string[]} [options.collections] keys holding the rows
 * @param {object} [options.aliases] per-field alias overrides
 * @param {string} [options.chatPrefix] prefix for synthetic chat ids
 */
export const jobBoardArchiveToLinks = (
  source,
  archive,
  { collections = ['messages'], aliases = {}, chatPrefix = 'job' } = {}
) => {
  const fields = { ...DEFAULT_ALIASES, ...aliases };
  const out = [];
  let index = 0;
  for (const row of rowsOf(parsed(archive), collections)) {
    for (const message of messagesOf(row)) {
      index += 1;
      const chat = pick(message, fields.chat);
      out.push(
        buildMessageLink({
          source,
          externalId: String(pick(message, fields.externalId) ?? index),
          sender: String(pick(message, fields.sender) ?? 'unknown'),
          chat: chat ? `${chatPrefix}:${chat}` : `${chatPrefix}:inbox`,
          body: String(pick(message, fields.body) ?? ''),
          timestamp: pick(message, fields.timestamp) ?? null,
        })
      );
    }
  }
  return out;
};

/**
 * Build a browser-only source adapter.
 *
 * @param {object} spec
 * @param {string} spec.name registry name, matching its CV platform id
 * @param {string[]} spec.collections archive keys holding the rows
 * @param {object} [spec.aliases] archive field alias overrides
 * @param {string} [spec.chatPrefix] prefix for synthetic chat ids
 * @param {string} spec.inboxUrl where a human reads those messages
 * @param {string[]} [spec.notes] operator-facing caveats
 */
export const createJobBoardSource = ({
  name,
  collections,
  aliases = {},
  chatPrefix = 'job',
  inboxUrl,
  notes = [],
}) => {
  const hint = `cv sync --platform ${name}`;
  const unsupported = (capability) => {
    throw new BrowserOnlySourceError(name, capability, hint);
  };
  const live = {
    browserOnly: true,
    inboxUrl,
    async pullMessages() {
      return unsupported('message');
    },
    async post() {
      return unsupported('message');
    },
    /** Resumes are written through the CV plan, in a real browser. */
    syncResume: (resume, options = {}) => writeSourceCv(name, resume, options),
  };

  return withCvPlatform(
    {
      name,
      browserOnly: true,
      notes,
      async parseArchive(archive) {
        return jobBoardArchiveToLinks(name, archive, {
          collections,
          aliases,
          chatPrefix,
        });
      },
      live,
      syncResume: (resume, options) => live.syncResume(resume, options),
    },
    name
  );
};
