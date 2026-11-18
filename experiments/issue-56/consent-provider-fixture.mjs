import { createMemoryStore } from '../../js/src/storage/universal.js';
import { guardedSend } from '../../js/src/automation/outbox.js';
import { createDefaultSender } from '../../js/src/sources/browser-sender.js';

/** Pause credential resolution or a definitely refused API; never contact a provider. */
export const withProviderConsent = async (source, stage, check) => {
  const store = createMemoryStore();
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const effects = [];
  const draft = { source, chat: '201', contact: 'person-201', text: 'Review' };
  const wait = async () => {
    entered.resolve();
    await release.promise;
  };
  const send = createDefaultSender({
    store,
    optionsFor: async () => {
      if (stage === 'options') {
        await wait();
      }
      return { connection: 'fixture' };
    },
    getSource: () => ({
      live: {
        sendMessage: async (message, options) => {
          if (stage === 'fallback') {
            await wait();
            throw Object.assign(new Error('API refused before sending'), {
              code: 'api-unavailable',
              fallback: true,
            });
          }
          effects.push({ via: 'api', message, options });
          if (stage === 'receipt') {
            await wait();
          }
          return { messageId: '301' };
        },
      },
    }),
    browser: {
      send: async (message) => {
        effects.push({ via: 'browser', message });
        return { messageId: '302' };
      },
      close: async () => {},
    },
  });
  const pending = guardedSend({
    store,
    draft,
    send,
    userConfirmed: stage === 'fallback',
  });
  try {
    await entered.promise;
    return await check({ store, draft, effects, release, pending, send });
  } finally {
    release.resolve();
    await pending;
    await send.close();
    await store.close?.();
  }
};
