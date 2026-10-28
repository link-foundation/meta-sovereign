// Give edited attachments a new browser cache key; the message ID stays the
// same when Telegram replaces its photo or file.
export const versionedMediaApi = (api, version) => {
  if (!api || !version) {
    return api;
  }
  const wrapped = Object.create(api);
  for (const method of ['telegramMediaUrl', 'telegramFileUrl']) {
    if (typeof api[method] === 'function') {
      wrapped[method] = async (args) => {
        const url = await api[method](args);
        return url
          ? `${url}${url.includes('?') ? '&' : '?'}version=${encodeURIComponent(String(version))}`
          : url;
      };
    }
  }
  return wrapped;
};
