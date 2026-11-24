/* global Event */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { withHhBrowserScanFixture } from './e2e-hh-chat-scan.mjs';
import {
  textReplyHtml,
  textReplyBody,
} from '../../../experiments/issue-56/text-reply-fixture.mjs';

const target = { source: 'hh', chat: '7' };
const state = (frame) =>
  frame.evaluate(() => ({
    ...window.textReplyState(),
    focused: document.hasFocus(),
    lease: Boolean(
      window[Symbol.for('meta-sovereign.browser-inactive-view.v1')]
    ),
  }));
const inactive = async (page) => {
  const other = await page.context().newPage();
  await other.setContent(
    '<title>Owner workspace</title><textarea>Active owner draft</textarea>'
  );
  await other.bringToFront();
  await other.locator('textarea').fill('Active owner draft');
  await other
    .locator('textarea')
    .evaluate((node) => node.setSelectionRange(2, 8));
  return other;
};
const ownerState = (page) =>
  page.evaluate(() => ({
    focused: document.hasFocus(),
    draft: document.querySelector('textarea').value,
    selection: [
      document.querySelector('textarea').selectionStart,
      document.querySelector('textarea').selectionEnd,
    ],
  }));

const createInactiveRunner = (browser, screenshots, outcomes) => {
  const screenshot = async (page, name) => {
    if (!screenshots) {
      return;
    }
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({
      path: join(screenshots, `${name}.png`),
      fullPage: true,
    });
  };
  const run = async (name, options, check) => {
    await withHhBrowserScanFixture(
      browser,
      {
        html: textReplyHtml,
        choiceReceiptMs: 100,
        isRead: ({ args }) => args?.[0]?.operation === 'armText',
        ...options,
      },
      async ({ sender, page, commander }) => {
        const handle = await sender.openAnswerWatch(target);
        try {
          if (!handle.replyTextInactive) {
            await screenshot(page, 'before');
          }
          assert.equal(typeof handle.replyTextInactive, 'function');
          await check({
            sender,
            page,
            commander,
            handle,
            expected: await handle.read(),
          });
          outcomes.push(name);
          console.log(`[inactive-text] PASS ${name}`);
        } finally {
          await handle.close();
        }
      }
    );
  };
  return { run, screenshot };
};
const send = ({ handle, expected }, verify) =>
  handle.replyTextInactive(expected, textReplyBody, verify);

/** Owned writes to actual controls, with native focus and positive receipts. */
export const verifyInactiveText = async (browser, { screenshots } = {}) => {
  const outcomes = [];
  const { run, screenshot } = createInactiveRunner(
    browser,
    screenshots,
    outcomes
  );
  if (browser.browserType().name() !== 'chromium') {
    await run('unsupported-focus-refused', {}, async (fixture) => {
      await assert.rejects(send(fixture), {
        code: 'browser-background-focus-unavailable',
      });
      assert.equal((await state(fixture.page)).sends, 0);
    });
    return { cases: outcomes.length, outcomes, liveProvider: false };
  }
  await run('focused-no-write', {}, async (fixture) => {
    await fixture.page.bringToFront();
    const before = await state(fixture.page);
    await assert.rejects(send(fixture), {
      code: 'browser-background-owner-active',
    });
    assert.deepEqual(await state(fixture.page), before);
  });
  for (const framed of [false, true]) {
    await run(
      framed ? 'inactive-child-receipt' : 'inactive-main-receipt',
      framed ? { frames: [{ url: 'https://chatik.hh.ru/chat/7' }] } : {},
      async (fixture) => {
        const { page } = fixture;
        const frame = framed
          ? page.frames().find((value) => value !== page.mainFrame())
          : page;
        await frame.evaluate(() => {
          window.clickFocus = [];
          document.querySelector('#send').addEventListener('click', (event) => {
            window.clickFocus.push({
              focused: document.hasFocus(),
              trusted: event.isTrusted,
            });
          });
        });
        const other = await inactive(page);
        const owner = await ownerState(other);
        const receipt = await send(fixture);
        assert.equal(receipt.messageId, '102');
        assert.equal(receipt.text, textReplyBody);
        const after = await state(frame);
        assert.equal(after.focused, false);
        assert.equal(after.sends, 1);
        assert.equal(after.choices, 0);
        assert.equal(after.hooks, 0);
        assert.equal(after.lease, false);
        assert.equal(after.draft, '');
        assert.deepEqual(await frame.evaluate(() => window.clickFocus), [
          { focused: false, trusted: false },
        ]);
        assert.deepEqual(await ownerState(other), owner);
        if (!framed) {
          await screenshot(page, 'after');
          assert.equal((await state(page)).focused, false);
          await screenshot(other, 'owner-preserved');
        }
      }
    );
  }
  for (const activity of ['focus', 'input']) {
    await run(
      `late-${activity}-no-send`,
      {
        onRead: async (page) => {
          if (activity === 'focus') {
            await page.bringToFront();
          } else {
            await page.locator('textarea').evaluate((node) => {
              node.value = 'New owner input';
              node.dispatchEvent(new Event('input', { bubbles: true }));
            });
          }
        },
      },
      async (fixture) => {
        await inactive(fixture.page);
        await assert.rejects(send(fixture), {
          code: 'browser-background-owner-active',
        });
        const after = await state(fixture.page);
        assert.equal(after.sends, 0);
        assert.equal(after.lease, false);
        assert.equal(after.hooks, 0);
        if (activity === 'input') {
          assert.equal(after.draft, 'New owner input');
        }
      }
    );
  }
  await verifyLateActivation(run);
  await run(
    'changed-current-knowledge-cleans-own-draft',
    {},
    async (fixture) => {
      await inactive(fixture.page);
      let checks = 0;
      const failure = new Error('Current knowledge changed');
      await assert.rejects(
        send(fixture, () => {
          if (++checks === 2) {
            throw failure;
          }
        }),
        failure
      );
      const after = await state(fixture.page);
      assert.equal(after.sends, 0);
      assert.equal(after.draft, '');
      assert.equal(after.hooks, 0);
      assert.equal(after.lease, false);
    }
  );
  await verifyInactiveClose(run);
  return { cases: outcomes.length, outcomes, liveProvider: false };
};

const verifyInactiveClose = async (run) => {
  await run('uncertain-once-and-drained-close', {}, async (fixture) => {
    const { page, handle, commander } = fixture;
    await page.evaluate(() => {
      window.fixture.receipt = 'none';
    });
    await inactive(page);
    let issued;
    const started = new Promise((resolve) => {
      issued = resolve;
    });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const click = commander.clickButton.bind(commander);
    commander.clickButton = async (options) => {
      await click(options);
      issued();
      await gate;
    };
    const pending = assert.rejects(send(fixture), { code: 'send-unknown' });
    await started;
    let drained = false;
    const closing = handle.close().then(() => {
      drained = true;
    });
    try {
      await Promise.resolve();
      assert.equal(drained, false);
    } finally {
      release();
      await pending;
      await closing;
    }
    assert.equal(drained, true);
    assert.equal((await state(page)).sends, 1);
    await assert.rejects(send(fixture), {
      code: 'question-watch-page-changed',
    });
    assert.equal((await state(page)).sends, 1);
  });
};

const verifyLateActivation = async (run) => {
  await run('latest-main-focus-check', {}, async (fixture) => {
    const { page, commander } = fixture;
    await inactive(page);
    const click = commander.clickButton.bind(commander);
    commander.clickButton = async (options) => {
      await page.bringToFront();
      return click(options);
    };
    // This return occurs after adapter checks: the page-local guard still
    // blocks DOM activation and no synthetic pointer event can hide it.
    await assert.rejects(send(fixture), { code: 'answer-text-changed' });
    assert.equal((await state(page)).sends, 0);
  });
  await run(
    'latest-embedded-outer-focus-check',
    {
      frames: [{ url: 'https://chatik.hh.ru/chat/7' }],
    },
    async (fixture) => {
      const { page } = fixture;
      await inactive(page);
      const frame = page.frames().find((value) => value !== page.mainFrame());
      const locate = frame.locator.bind(frame);
      frame.locator = (selector, options) => {
        const locator = locate(selector, options);
        if (selector.startsWith('[data-meta-answer-choice=')) {
          const evaluate = locator.evaluate.bind(locator);
          locator.evaluate = async (...args) => {
            await page.bringToFront();
            assert.equal(
              await frame.evaluate(() => document.hasFocus()),
              false
            );
            return evaluate(...args);
          };
        }
        return locator;
      };
      await assert.rejects(send(fixture), { code: 'answer-text-changed' });
      assert.equal((await state(frame)).sends, 0);
    }
  );
};
