import {
  extractFollowLinks,
  listFollowLinks,
  clearFollowLinks,
} from '../follow/link-cache.js';

export const followApi = ({ remote, store }) => {
  const checked = (result) => {
    if (result?.error || result?.status === 'failed') {
      throw Object.assign(new Error(result.error ?? result.code), {
        code: result.code,
      });
    }
    return result;
  };
  const request = async (action, input, read = false) => {
    const path = read
      ? `/api/automations/follow?${new URLSearchParams(input)}`
      : `/api/automations/follow/${action}`;
    if (!remote.request) {
      return checked(
        read
          ? await remote.get(path)
          : await (remote.report ?? remote.post)(path, input, { network: true })
      );
    }
    const response = await remote.request(
      path,
      read
        ? undefined
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
          },
      { network: true }
    );
    if (!response) {
      return null;
    } // No configured server: use this browser's store.
    const data = await response.json().catch(() => null);
    checked(data);
    if (!response.ok || !validResult(action, data)) {
      throw Object.assign(
        new Error('Follow cache response could not be confirmed'),
        {
          code: 'follow-cache-response',
        }
      );
    }
    return data;
  };
  const write = async (action, input, fallback) =>
    (await request(action, input)) ?? fallback(store, input);
  return {
    followLinks: async (input = {}) =>
      (await request('links', input, true)) ?? listFollowLinks(store, input),
    extractFollowLinks: (input = {}) =>
      write('extract', input, extractFollowLinks),
    clearFollowLinks: (input = {}) => write('clear', input, clearFollowLinks),
  };
};

const validResult = (action, data) => {
  if (action === 'links') {
    return Array.isArray(data?.links) && Number.isSafeInteger(data.total);
  }
  return action === 'clear'
    ? Number.isSafeInteger(data?.cleared)
    : Number.isSafeInteger(data?.added) &&
        Number.isSafeInteger(data?.coverage?.scanned);
};
