export const noticePolicyModes = {
  acknowledgements: ['review', 'ignore', 'reply', 'reply-recognized'],
  rejections: ['review', 'ignore', 'reply'],
  invitations: ['review', 'ignore'],
};

const defaultRejectionReply = 'Здравствуйте, могу я узнать причину?';
export const maxNoticePolicyOverrides = 100;
const overrideFields = new Set([
  'source',
  'chat',
  ...Object.keys(noticePolicyModes),
  'rejectionReply',
]);

const normalizeDecisions = (input, partial) => {
  const result = {};
  for (const [kind, allowed] of Object.entries(noticePolicyModes)) {
    if (partial && !Object.hasOwn(input, kind)) {
      continue;
    }
    const mode = partial ? input[kind] : (input[kind] ?? 'review');
    if (!allowed.includes(mode)) {
      throw new Error(`unsupported ${kind} notice policy`);
    }
    result[kind] = mode;
  }
  if (partial && !Object.hasOwn(input, 'rejectionReply')) {
    return result;
  }
  const reply = partial
    ? input.rejectionReply
    : (input.rejectionReply ?? defaultRejectionReply);
  if (typeof reply !== 'string' || !reply.trim() || reply.length > 12000) {
    throw new Error('rejection reply needs between 1 and 12000 characters');
  }
  return { ...result, rejectionReply: reply };
};

const normalizeOverride = (entry) => {
  if (
    !entry ||
    typeof entry !== 'object' ||
    Array.isArray(entry) ||
    Object.keys(entry).some((key) => !overrideFields.has(key)) ||
    typeof entry.source !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{0,79}$/u.test(entry.source) ||
    (entry.chat !== undefined &&
      (typeof entry.chat !== 'string' ||
        !entry.chat ||
        entry.chat !== entry.chat.trim() ||
        entry.chat.length > 480 ||
        /[\p{Cc}\p{Cf}]/u.test(entry.chat)))
  ) {
    throw new Error(
      'notice override requires a provider and optional exact chat ID'
    );
  }
  const decisions = normalizeDecisions(entry, true);
  if (!Object.keys(decisions).length) {
    throw new Error('notice override requires at least one decision or reply');
  }
  return {
    source: entry.source,
    ...(entry.chat !== undefined && { chat: entry.chat }),
    ...decisions,
  };
};

/** Separate saved decisions; configuring them never starts a watcher. */
export const normalizeNoticePolicy = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('notice policy must be an object');
  }
  const defaults = normalizeDecisions(input, false);
  if (input.overrides === undefined) {
    return defaults;
  }
  if (
    !Array.isArray(input.overrides) ||
    input.overrides.length > maxNoticePolicyOverrides
  ) {
    throw new Error(
      `notice policy accepts up to ${maxNoticePolicyOverrides} overrides`
    );
  }
  const overrides = Array.from(input.overrides, normalizeOverride);
  const identities = new Set(
    overrides.map(({ source, chat }) => JSON.stringify([source, chat]))
  );
  if (identities.size !== overrides.length) {
    throw new Error(
      'notice policy overrides must have distinct provider and chat IDs'
    );
  }
  return { ...defaults, ...(overrides.length && { overrides }) };
};

export const repliesAutomatically = (mode) =>
  mode === 'reply' || mode === 'reply-recognized';

export const noticePolicyFor = (notices, source, chat) => {
  const { overrides = [], ...defaults } = notices;
  const decisionsFor = (id) => {
    const {
      source: _source,
      chat: _chat,
      ...decisions
    } = overrides.find(
      (entry) => entry.source === source && entry.chat === id
    ) ?? {};
    return decisions;
  };
  return {
    ...defaults,
    ...decisionsFor(undefined),
    ...(chat !== undefined && decisionsFor(chat)),
  };
};
