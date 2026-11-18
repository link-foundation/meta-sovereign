import assert from 'node:assert/strict';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import {
  createBrowserSender,
  WEB_UIS,
} from '../../js/src/sources/browser-sender.js';

/** Finite browser waits; no browser, profile or provider is accessed. */
export const withBrowserSendConsent = async (source, stage, check) => {
  const store = createMemoryStore();
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const effects = [];
  const typed = [];
  const ui = WEB_UIS[source];
  const first = (value) => value?.split(',')[0].trim();
  const composer = first(ui.composer);
  const button = first(ui.send.selector);
  const wait = async (at) => {
    if (at === stage) {
      entered.resolve();
      await release.promise;
    }
  };
  const commander = {
    goto: async () => wait('open'),
    count: async ({ selector }) => {
      if (selector === button) {
        await wait('button');
      }
      return 1;
    },
    clickButton: async ({ selector }) => {
      if (selector === composer) {
        await wait('focus');
      } else {
        effects.push('click');
        await wait('issued');
      }
    },
    typeText: async ({ text }) => {
      typed.push(text);
      await wait('type');
    },
    fillTextArea: async ({ text }) => {
      typed.push(text);
      await wait('fill');
    },
    pressKey: async ({ key }) => {
      effects.push(key);
      await wait('issued');
    },
  };
  let closed = 0;
  const sender = createBrowserSender({
    store,
    input: stage === 'fill' ? 'fill' : 'type',
    loginTimeoutMs: 0,
    pollMs: 0,
    openSession: async () => ({
      commander,
      close: () => {
        closed += 1;
      },
    }),
  });
  const draft = {
    source,
    chat: '201',
    to: source === 'whatsapp' ? '+12025550123' : 'person-201',
    text: 'Review',
  };
  const pending = sender.send(draft).then(
    (result) => ({ result }),
    (error) => ({ error })
  );
  try {
    await Promise.race([
      entered.promise,
      pending.then(() => {
        throw new Error('Send completed before the expected browser wait');
      }),
    ]);
    return await check({
      store,
      sender,
      draft,
      entered,
      release,
      effects,
      typed,
      pending,
    });
  } finally {
    release.resolve();
    await pending;
    await sender.close();
    await store.close?.();
    assert.equal(closed, 1, 'The isolated browser session must close once');
  }
};
