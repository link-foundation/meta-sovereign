export const noticePolicyModes = {
  acknowledgements: ['review', 'ignore', 'reply', 'reply-recognized'],
  rejections: ['review', 'ignore', 'reply'],
  invitations: ['review', 'ignore'],
};

/** Separate saved decisions; configuring them never starts a watcher. */
export const normalizeNoticePolicy = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('notice policy must be an object');
  }
  const result = {};
  for (const [kind, allowed] of Object.entries(noticePolicyModes)) {
    const mode = input[kind] ?? 'review';
    if (!allowed.includes(mode)) {
      throw new Error(`unsupported ${kind} notice policy`);
    }
    result[kind] = mode;
  }
  const reply = input.rejectionReply ?? 'Здравствуйте, могу я узнать причину?';
  if (typeof reply !== 'string' || !reply.trim() || reply.length > 12000) {
    throw new Error('rejection reply needs between 1 and 12000 characters');
  }
  return { ...result, rejectionReply: reply };
};
