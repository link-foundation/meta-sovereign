import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeBrowserCommander } from 'browser-commander';
import {
  createBrowserSender,
  WEB_UIS,
} from '../../src/sources/browser-sender.js';
import { browserComposerHtml } from '../../../experiments/issue-56/browser-composer-native-fixture.mjs';

/** One isolated provider document and actual native commander input/send calls. */
export const verifyBrowserComposerDraft = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(browserComposerHtml);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    viewport: { width: 1050, height: 780 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  // Native effects are asserted below; avoid waiting for the generic click
  // observer to infer a DOM mutation from merely focusing a composer.
  const proxy = Object.create(commander);
  proxy.clickButton = (options) =>
    commander.clickButton({
      ...options,
      verify: false,
      waitForNavigation: false,
      waitAfterClick: 0,
      waitAfterScroll: 0,
      smoothScroll: false,
    });
  const read = () =>
    page
      .locator('[data-composer]')
      .evaluate((node) => ('value' in node ? node.value : node.innerText));
  let cases = 0;
  try {
    for (const spec of [
      {
        source: 'vk',
        kind: 'textarea',
        input: 'fill',
        initial: 'Owner draft: review before sending',
      },
      {
        source: 'telegram',
        kind: 'editable',
        input: 'type',
        initial: 'Owner draft: review before sending',
      },
      {
        source: 'whatsapp',
        kind: 'editable',
        input: 'fill',
        initial: 'Owner draft: review before sending',
      },
      { source: 'vk', kind: 'textarea', input: 'type', initial: '' },
      { source: 'vk', kind: 'textarea', input: 'fill', initial: '' },
      { source: 'whatsapp', kind: 'editable', input: 'fill', initial: '' },
    ]) {
      const ui = {
        ...WEB_UIS[spec.source],
        loggedIn: '[data-ready]',
        loggedOut: '[data-logged-out]',
        composer: '[data-composer]',
        send: { selector: 'button', key: 'Enter' },
        chatUrl: (_target, { text } = {}) => {
          const url = new URL(`${base}/chat`);
          url.searchParams.set('kind', spec.kind);
          url.searchParams.set('draft', spec.initial);
          if (text) {
            url.searchParams.set('text', text);
          }
          return url.href;
        },
      };
      const sender = createBrowserSender({
        platforms: { [spec.source]: ui },
        input: spec.input,
        loginTimeoutMs: 500,
        pollMs: 10,
        openSession: async () => ({ commander: proxy, page, close() {} }),
      });
      try {
        const outcome = await sender
          .send({
            source: spec.source,
            chat: '201',
            to: '+12025550123',
            text: 'Reviewed\nreply',
          })
          .then(
            (result) => ({ result }),
            (error) => ({ code: error.code, message: error.message })
          );
        console.log(
          '[composer-native]',
          JSON.stringify({
            source: spec.source,
            kind: spec.kind,
            input: spec.input,
            initial: Boolean(spec.initial),
            outcome,
            value: await read(),
            receipts: await page.evaluate(() => window.receipts),
          })
        );
        if (screenshots && spec.source === 'vk' && spec.initial) {
          await mkdir(screenshots, { recursive: true });
          await page.screenshot({
            path: join(
              screenshots,
              `browser-composer-draft-${before ? 'before' : 'after'}.png`
            ),
          });
        }
        if (spec.initial) {
          assert.equal(outcome.code, 'answer-draft-preserved');
          assert.equal(await read(), spec.initial);
          assert.deepEqual(await page.evaluate(() => window.receipts), []);
        } else {
          assert.equal(outcome.result?.via, 'browser', JSON.stringify(outcome));
          assert.deepEqual(await page.evaluate(() => window.receipts), [
            'Reviewed\nreply',
          ]);
        }
        assert.equal(new URL(page.url()).searchParams.has('text'), false);
        cases++;
      } finally {
        await sender.close();
      }
    }
    assert.deepEqual(errors, []);
    return {
      cases,
      ownerDraftsRetained: 3,
      emptyComposerSends: 3,
      urlPrefills: 0,
      pageErrors: errors.length,
    };
  } finally {
    await context.close();
    await new Promise((resolve) => server.close(resolve));
  }
};
