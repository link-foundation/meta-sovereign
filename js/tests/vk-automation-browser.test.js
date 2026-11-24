import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { vkAutomationBrowser } from './helpers/vk-automation-browser.mjs';

const base = 'http://127.0.0.1:49291';
const replayBrowser = (engine) => {
  const context = new EventEmitter();
  context.pages = () => [];
  context.route = async () => {};
  context.newPage = async () => {
    const page = new EventEmitter();
    page.addInitScript = async () => {};
    context.emit('page', page);
    return page;
  };
  context.close = async () => {};
  return {
    newContext: async () => context,
    browserType: () => ({ name: () => engine }),
  };
};

for (const engine of ['webkit', 'chromium']) {
  test(`VK fixtures preserve genuine ${engine} exceptions and scope native diagnostics to their origin`, async () => {
    const { context, page, errors } = await vkAutomationBrowser(
      replayBrowser(engine),
      '👋',
      base
    );
    try {
      // Exact native Error name/message split from hosted run 43668793618.
      const native = new Error(
        '/127.0.0.1:49291/api/status?probe=1 due to access control checks.'
      );
      native.name = 'Fetch API cannot load http';
      page.emit('pageerror', native);
      assert.equal(errors.length, engine === 'webkit' ? 0 : 1);
      const foreign = new Error(native.message.replace('49291', '49292'));
      foreign.name = native.name;
      const genuine = new TypeError('Load failed');
      const lookalike = new Error(String(native));
      for (const error of [foreign, genuine, lookalike]) {
        page.emit('pageerror', error);
      }
      assert.deepEqual(
        errors,
        (engine === 'webkit'
          ? [foreign, genuine, lookalike]
          : [native, foreign, genuine, lookalike]
        ).map(String)
      );
    } finally {
      await context.close();
    }
  });
}
