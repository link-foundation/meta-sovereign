import { createHash } from 'node:crypto';

const isNumericId = (value) => /^-?\d+$/.test(String(value));

/** WhatsApp's `data-pre-plain-text`: "[10:15, 11/10/2026] Anna: ". */
const PRE_PLAIN = /^\[([^\]]+)\]\s*(.*?):?\s*$/;

const toIso = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (isNumericId(value)) {
    const n = Number(value);
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
};

const shortHash = (value) =>
  createHash('sha1').update(value).digest('hex').slice(0, 12);

/** Turn an extracted row into a message link like the API adapters'. */
export const toBrowserMessageLink = (source, chat, row) => {
  const pre = PRE_PLAIN.exec(row.sender ?? '');
  const sender = (pre ? pre[2] : row.sender) || (row.outgoing ? 'me' : '');
  const timestamp =
    toIso(row.timestamp) ?? toIso(pre ? pre[1] : row.time) ?? null;
  const key = row.id || shortHash(`${sender}\n${row.body}\n${row.time ?? ''}`);
  return {
    id: `msg:${source}:${chat}:${key}`,
    tokens: ['message', source, chat],
    source,
    chat,
    sender: sender || null,
    body: row.body,
    timestamp,
    outgoing: Boolean(row.outgoing),
    ...(row.service === true ? { service: true } : {}),
    ...(row.strictOptions !== undefined
      ? { strictOptions: row.strictOptions, answerOptions: row.answerOptions }
      : {}),
    via: 'browser',
  };
};
