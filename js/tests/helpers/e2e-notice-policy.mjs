import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createMemoryStore } from '../../src/storage/universal.js';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { saveAnswerPolicy } from '../../src/automation/question-policy.js';
import { createQuestionBrowser } from '../../src/automation/question-browser.js';
import { newBrowserWatchId } from '../../src/automation/question-browser-watch.js';
import { withHhBrowserScanFixture } from './e2e-hh-chat-scan.mjs';
import { noticePolicyHtml } from '../../../experiments/issue-56/notice-policy-browser-fixture.mjs';
import {
  noticeRule,
  noticeReply,
} from '../../../experiments/issue-56/notice-fixture.mjs';
import { rejectionText } from '../../../experiments/issue-56/notice-policy-fixture.mjs';

const pause = () =>
  new Promise((resolve) => globalThis.setTimeout(resolve, 20));
const until = async (read, predicate) => {
  for (let tries = 0; tries < 200; tries++) {
    const value = await read();
    if (predicate(value)) {
      return value;
    }
    await pause();
  }
  assert.fail('The finite browser notice condition was not reached');
};
const counts = (page) => page.evaluate(() => window.textReplyState());
const inactive = async (page) => {
  const other = await page.context().newPage();
  await other.setContent(
    '<title>Owner workspace</title><textarea>Owner unfinished draft</textarea>'
  );
  await other.bringToFront();
  await other.locator('textarea').fill('Owner unfinished draft');
  return other;
};

const runNoticeCase = async (
  engine,
  screenshots,
  outcomes,
  name,
  fixture,
  check
) =>
  withHhBrowserScanFixture(
    engine,
    { html: noticePolicyHtml(fixture), choiceReceiptMs: 100 },
    async ({ sender, page }) => {
      const store = createMemoryStore();
      await saveAnswerRule(store, noticeRule());
      await saveAnswerPolicy(store, {
        notices: {
          acknowledgements: 'reply',
          rejections: 'reply',
          rejectionReply: 'May I ask why?',
        },
      });
      // Keep the production traversal, with a smaller finite fixture settle wait.
      const open = sender.openAnswerWatch;
      sender.openAnswerWatch = async (...args) => {
        const handle = await open(...args);
        const history = handle.readInactiveHistory;
        handle.readInactiveHistory = (input) =>
          history({ ...input, waitMs: 20, endWaitMs: 100, budgetMs: 5000 });
        if (fixture.changeContext) {
          const reply = handle.replyTextInactive;
          handle.replyTextInactive = async (...input) => {
            await page
              .locator('[data-qa="participant-info-title"]')
              .evaluate((node) => {
                node.textContent = 'Another employer';
              });
            return reply(...input);
          };
        }
        return handle;
      };
      const send = Object.assign(
        () => assert.fail('No ordinary provider sends'),
        sender
      );
      const browser = createQuestionBrowser({
        store,
        send,
        watchIntervalMs: 20,
      });
      const review = await browser.inspect({
        source: 'hh',
        chat: 'https://hh.ru/chat/7',
      });
      const input = {
        id: newBrowserWatchId(),
        review: review.id,
        confirm: true,
        noticeReplies: true,
      };
      const status = () => browser.watchStatus(input);
      try {
        await check({ browser, page, store, input, review, status });
        if (screenshots && name === 'acknowledgement-inactive-receipt') {
          await mkdir(screenshots, { recursive: true });
          await page.screenshot({
            path: join(screenshots, 'provider-after.png'),
            fullPage: true,
          });
        }
        outcomes.push(name);
        console.log(`[notice-policy] PASS ${name}`);
      } finally {
        await browser.close();
      }
    }
  );

/** Production planner/outbox/owned adapter on actual HH-shaped browser controls. */
export const verifyNoticePolicies = async (engine, { screenshots } = {}) => {
  const outcomes = [];
  const run = (...args) =>
    runNoticeCase(engine, screenshots, outcomes, ...args);
  if (engine.browserType().name() !== 'chromium') {
    await run(
      'unsupported-focus-refused',
      {},
      async ({ browser, input, status, page }) => {
        await browser.watchStart(input);
        const paused = await until(
          status,
          (s) => s.state === 'paused' && !s.owned
        );
        assert.equal(paused.reason, 'browser-background-focus-unavailable');
        assert.equal((await counts(page)).sends, 0);
      }
    );
    return { cases: outcomes.length, outcomes, liveProvider: false };
  }
  await run(
    'acknowledgement-inactive-receipt',
    {},
    async ({ browser, input, status, page, review }) => {
      assert.equal(review.noticeContext.canReply, true);
      await page.bringToFront();
      await browser.watchStart(input);
      await until(status, (s) => s.phase === 'owner-active');
      assert.equal((await counts(page)).sends, 0);
      const other = await inactive(page);
      const sent = await until(
        status,
        (s) => s.outbox?.receipt?.messageId === '102'
      );
      assert.equal(sent.outbox.receipt.text, noticeReply);
      assert.equal(sent.outbox.receipt.messageId, '102');
      assert.equal((await counts(page)).sends, 1);
      assert.equal((await counts(page)).choices, 0);
      assert.equal(await page.evaluate(() => document.hasFocus()), false);
      assert.equal(
        await other.locator('textarea').inputValue(),
        'Owner unfinished draft'
      );
      await browser.watchStop(input);
    }
  );
  await run(
    'rejection-once-per-chat',
    { body: rejectionText },
    async ({ browser, input, status, page }) => {
      await inactive(page);
      await browser.watchStart(input);
      const sent = await until(
        status,
        (s) => s.outbox?.receipt?.messageId === '102'
      );
      assert.equal(sent.outbox.kind, 'question-rejection');
      assert.equal(sent.outbox.receipt.text, 'May I ask why?');
      assert.equal((await counts(page)).sends, 1);
      await browser.watchStop(input);
    }
  );
  for (const [name, fixture] of [
    ['closed-chat-review', { closed: true }],
    ['support-without-vacancy-review', { support: true }],
    ['earlier-task-review', { earlier: 'What time can you start?' }],
  ]) {
    await run(name, fixture, async ({ browser, input, status, page }) => {
      await inactive(page);
      await browser.watchStart(input);
      await until(status, (s) => s.phase === 'review');
      assert.equal((await counts(page)).sends, 0);
      assert.equal((await counts(page)).draft, '');
    });
  }
  await run(
    'employer-changed-before-dispatch',
    { changeContext: true },
    async ({ browser, input, status, page }) => {
      await inactive(page);
      await browser.watchStart(input);
      const paused = await until(
        status,
        (s) => s.state === 'paused' && !s.owned
      );
      assert.equal(paused.phase, 'failed');
      assert.equal(paused.reason, 'answer-text-changed');
      assert.equal((await counts(page)).sends, 0);
      assert.equal((await counts(page)).draft, '');
    }
  );
  await run(
    'unknown-no-retry',
    {},
    async ({ browser, input, status, page }) => {
      await page.evaluate(() => {
        window.fixture.receipt = 'none';
      });
      await inactive(page);
      await browser.watchStart(input);
      const paused = await until(
        status,
        (s) => s.phase === 'unknown' && !s.owned
      );
      assert.equal(paused.outbox.status, 'unknown');
      assert.equal((await browser.watchStart(input)).state, 'paused');
      assert.equal((await counts(page)).sends, 1);
    }
  );
  return { cases: outcomes.length, outcomes, liveProvider: false };
};
