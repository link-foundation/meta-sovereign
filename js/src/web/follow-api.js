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
      ? `/api/automations/follow${action === 'links' ? '' : `/${action}`}?${new URLSearchParams(input)}`
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
          code: ['chats', 'details'].includes(action)
            ? 'follow-provider-response'
            : 'follow-cache-response',
        }
      );
    }
    return data;
  };
  const write = async (action, input, fallback) =>
    (await request(action, input)) ?? fallback(store, input);
  const discover = async (action, input) => {
    const result = await request(action, input, true);
    if (!result) {
      throw Object.assign(
        new Error('Connect a server with VK to discover group chats'),
        { code: 'follow-server-required' }
      );
    }
    if (!validResult(action, result)) {
      throw Object.assign(
        new Error('Follow discovery response could not be confirmed'),
        { code: 'follow-provider-response' }
      );
    }
    return result;
  };
  return {
    followChats: (input = {}) => discover('chats', input),
    followChatDetails: (input = {}) => discover('details', input),
    followLinks: async (input = {}) =>
      (await request('links', input, true)) ?? listFollowLinks(store, input),
    extractFollowLinks: (input = {}) =>
      write('extract', input, extractFollowLinks),
    clearFollowLinks: (input = {}) => write('clear', input, clearFollowLinks),
  };
};

const nonnegative = (value) => Number.isSafeInteger(value) && value >= 0;
const validPage = (page) =>
  Boolean(page) &&
  nonnegative(page.offset) &&
  nonnegative(page.scanned) &&
  nonnegative(page.limit) &&
  page.limit > 0 &&
  page.scanned <= page.limit &&
  (page.total === null || nonnegative(page.total)) &&
  typeof page.complete === 'boolean' &&
  typeof page.more === 'boolean' &&
  (page.more
    ? nonnegative(page.nextOffset) && page.nextOffset > page.offset
    : page.nextOffset === null);
const validChat = (chat) =>
  typeof chat?.chat === 'string' &&
  chat.source === 'vk' &&
  typeof chat.title === 'string';
const validRows = (rows, check) => Array.isArray(rows) && rows.every(check);
const validators = {
  chats: (data) => validRows(data?.chats, validChat) && validPage(data?.page),
  details: (data) =>
    validChat(data?.chat) &&
    validRows(data?.members, (row) => typeof row?.id === 'string') &&
    validRows(data?.messages, (row) => typeof row?.text === 'string') &&
    validPage(data?.memberPage) &&
    validPage(data?.messagePage),
  links: (data) =>
    Array.isArray(data?.links) && Number.isSafeInteger(data.total),
  clear: (data) => Number.isSafeInteger(data?.cleared),
  extract: (data) =>
    Number.isSafeInteger(data?.added) &&
    Number.isSafeInteger(data?.coverage?.scanned),
};
const validResult = (action, data) => validators[action](data);
