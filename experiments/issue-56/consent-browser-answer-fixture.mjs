import { consentBarrier, consentOutcome } from './consent-fixture.mjs';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createBrowserSender } from '../../js/src/sources/browser-sender.js';
import { providerChoiceDraft } from './provider-choice-fixture.mjs';
import { textReplyExpected, textReplyBody } from './text-reply-fixture.mjs';

const answerPage = (wait, state, choice) => {
  const page = new EventEmitter();
  const frame = {
    url: () => 'https://hh.ru/chat/7',
    evaluate: async (_fn, input) => {
      if (typeof input === 'string') {
        await wait('document');
        return { key: 'owned-document', rows: 1 };
      }
      if (input?.operation === 'release') {
        state.operations.push('release');
      }
      return { state: 'ready' };
    },
  };
  Object.assign(page, {
    url: frame.url,
    mainFrame: () => frame,
    frames: () => [frame],
    context: () => ({
      browser: () => ({ browserType: () => ({ name: () => 'chromium' }) }),
      newCDPSession: async () => ({
        send: async () => {},
        detach: async () => {},
      }),
    }),
  });
  const commander = {
    goto: async () => wait('open'),
    count: async () => 1,
    evaluate: async ({ args: [input] }) => {
      state.operations.push(input.operation);
      if (['arm', 'armText'].includes(input.operation)) {
        await wait('arm');
        return { armed: true, selector: '#provider-reply' };
      }
      if (input.operation === 'receipt') {
        await wait('receipt');
        return { sent: true, messageId: '102' };
      }
      if (input.operation === 'read') {
        return {
          ...textReplyExpected(),
          hasDraft: false,
          ...(choice
            ? { strictOptions: true, answerOptions: ['Yes.', 'No.'] }
            : {}),
        };
      }
      return { state: 'ready' };
    },
    clickButton: async () => {
      state.clicks += 1;
    },
  };
  return { page, commander };
};

/** Real sender/watch factories with finite fake native effects and no provider. */
export const withBrowserAnswerConsent = async (mode, stage, check) => {
  const store = createMemoryStore();
  const { entered, release, wait } = consentBarrier(stage);
  const state = { clicks: 0, operations: [], closed: 0 };
  const { page, commander } = answerPage(wait, state, mode.includes('choice'));
  const sender = createBrowserSender({
    store,
    loginTimeoutMs: 0,
    pollMs: 1,
    choiceReceiptMs: 50,
    openSession: async () => ({
      page,
      commander,
      close: () => {
        state.closed += 1;
      },
    }),
  });
  const target = { source: 'hh', chat: '7', to: 'person-7' };
  const draft = { ...providerChoiceDraft(), ...target };
  let watch;
  const pending = consentOutcome(
    (async () => {
      if (mode.startsWith('watch-')) {
        watch = await sender.openAnswerWatch(target);
        if (mode === 'watch-choice') {
          return watch.select(draft);
        }
        const method =
          mode === 'watch-inactive' ? 'replyTextInactive' : 'replyText';
        return watch[method](textReplyExpected(), textReplyBody);
      }
      return mode === 'choice'
        ? sender.send(draft)
        : sender.replyText({
            ...target,
            expected: textReplyExpected(),
            text: textReplyBody,
          });
    })()
  );
  try {
    await Promise.race([
      entered.promise,
      pending.then(() => {
        throw new Error('Answer completed before the expected native wait');
      }),
    ]);
    return await check({
      store,
      sender,
      target,
      draft,
      pending,
      release,
      state,
      getWatch: () => watch,
    });
  } finally {
    release.resolve();
    await pending;
    await watch?.close();
    await sender.close();
    await store.close?.();
    assert.equal(state.closed, 1);
    assert.deepEqual(page.eventNames(), []);
  }
};
