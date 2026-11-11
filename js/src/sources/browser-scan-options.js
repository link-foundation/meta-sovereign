const bounded = (value, fallback, minimum, maximum) => {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw Object.assign(new Error('Invalid bounded browser scan setting'), {
      code: 'bad-chat-scan',
      fallback: false,
    });
  }
  return result;
};

export const normalizeChatScanOptions = (options = {}) => {
  if (
    options.unreadOnly !== undefined &&
    typeof options.unreadOnly !== 'boolean'
  ) {
    throw Object.assign(new Error('Unread-only selection must be a boolean'), {
      code: 'bad-chat-scan',
      fallback: false,
    });
  }
  return {
    limit: bounded(options.limit, 500, 1, 5000),
    maxPasses: bounded(options.maxPasses, 100, 1, 500),
    budgetMs: bounded(options.budgetMs, 30000, 100, 120000),
    waitMs: bounded(options.waitMs, 150, 10, 1000),
    endWaitMs: bounded(options.endWaitMs, 2000, 100, 10000),
  };
};
