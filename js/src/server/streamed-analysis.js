import { scanLinks } from './store-scan.js';
import { createContactAggregation } from './aggregate.js';
import { evalAudience } from '../crm/audience.js';
import { localSearch } from '../crm/index.js';

const summary = (link) => ({
  id: link.id,
  source: link.source,
  chat: link.chat,
  chatName: link.chatName,
  chatType: link.chatType,
  sender: link.sender,
  senderName: link.senderName,
  timestamp: link.timestamp,
  body: link.body,
  facts: link.facts,
});
export const streamedAudience = async (store, query) => {
  const contacts = createContactAggregation();
  await scanLinks(
    store,
    null,
    (batch) => {
      for (const link of evalAudience(batch, query)) {
        contacts.message(link);
      }
    },
    summary
  );
  return contacts.result();
};

export const streamedCompletions = async (
  store,
  { prefix = '', me = 'me', limit = 10 }
) => {
  const lower = String(prefix).toLowerCase();
  let seen = new Map();
  await scanLinks(
    store,
    (link) =>
      link.id?.startsWith('msg:') &&
      link.sender === me &&
      typeof link.body === 'string' &&
      link.body.toLowerCase().startsWith(lower),
    (batch) => {
      for (const message of batch) {
        if (
          !seen.has(message.body) ||
          message.timestamp > seen.get(message.body)
        ) {
          seen.set(message.body, message.timestamp ?? '');
        }
      }
      seen = new Map(
        [...seen].sort((a, b) => b[1].localeCompare(a[1])).slice(0, limit)
      );
    },
    (link) => ({ body: link.body, timestamp: link.timestamp })
  );
  return [...seen.keys()];
};

export const streamedSearch = async (
  store,
  { query, min = 0.2, limit = 100 }
) => {
  let found = [];
  await scanLinks(
    store,
    (link) => typeof link.body === 'string',
    async (batch) => {
      found.push(
        ...(await localSearch({ query: async () => batch }, { query, min }))
      );
      found.sort((a, b) => b.score - a.score);
      found = found.slice(0, limit);
    },
    summary
  );
  return found;
};
