import { createMemoryStore } from '../../js/src/storage/universal.js';
import { guardedSend } from '../../js/src/automation/outbox.js';

export const consentSources = ['hh', 'telegram', 'vk', 'email', 'whatsapp'];

/** Hold exactly one durable admission, without a provider or background owner. */
export const withConsentAdmission = async (source, check, options = {}) => {
  const store = createMemoryStore();
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const effects = [];
  const originalPut = store.put.bind(store);
  let held = false;
  store.put = async (row) => {
    const result = await originalPut(row);
    if (!held && row.id.startsWith('outbox:') && row.status === 'sending') {
      held = true;
      entered.resolve();
      await release.promise;
    }
    return result;
  };
  const draft = { source, chat: '201', contact: 'person-201', text: 'Review' };
  const logs = [];
  const send = async (outgoing) => {
    effects.push(outgoing);
    return { via: 'fixture' };
  };
  const pending = guardedSend({
    store,
    draft,
    send,
    log: (entry) => logs.push(entry),
    ...options,
  });
  try {
    await entered.promise;
    return await check({ store, pending, release, effects, draft, logs, send });
  } finally {
    release.resolve();
    await pending;
    await store.close?.();
  }
};
