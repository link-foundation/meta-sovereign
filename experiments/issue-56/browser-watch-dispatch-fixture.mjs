import { EventEmitter } from 'node:events';
import { openBrowserAnswerWatch } from '../../js/src/sources/browser-answer-watch.js';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { providerChoiceDraft } from './provider-choice-fixture.mjs';
import { textReplyExpected, textReplyBody } from './text-reply-fixture.mjs';

/** Actual watched adapter, synthetic identity and finite injected page effects. */
export const browserWatchDispatchFixture = async (mode, options = {}) => {
  const state = { operations: [], clicks: 0, releases: 0, active: true };
  const page = new EventEmitter();
  const frame = {
    url: () => 'https://hh.ru/chat/7',
    evaluate: async (_fn, input) => {
      if (input?.operation === 'release') {
        state.operations.push('release');
        return {};
      }
      return { key: 'owned-document', rows: 1 };
    },
  };
  Object.assign(page, {
    url: frame.url,
    mainFrame: () => frame,
    frames: () => [frame],
  });
  const commander = {
    async evaluate({ args: [input] }) {
      state.operations.push(input.operation);
      if (['arm', 'armText'].includes(input.operation)) {
        await options.arming?.({ state, page });
        return { armed: true, selector: '#provider-reply' };
      }
      if (input.operation === 'receipt') {
        await options.receipt?.();
        return { sent: true, messageId: '102' };
      }
      return {};
    },
    async clickButton() {
      state.clicks++;
      await options.clicking?.();
    },
  };
  const watch = await openBrowserAnswerWatch({
    commander,
    page,
    ui: HH_WEB_UI,
    target: '7',
    queue: (work) => Promise.resolve().then(work),
    receiptMs: 50,
    pollMs: 1,
    released: () => state.releases++,
  });
  const verify = () => {
    if (!state.active) {
      throw Object.assign(new Error('Reviewed answer changed'), {
        code: 'question-watch-plan-changed',
      });
    }
  };
  return {
    state,
    page,
    watch,
    issue: () =>
      mode === 'choice'
        ? watch.select(providerChoiceDraft(), verify)
        : watch.replyText(textReplyExpected(), textReplyBody, verify),
  };
};
