import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createMemoryStore } from '../../src/storage/universal.js';
import { listOutbox } from '../../src/automation/outbox.js';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { saveAnswerPolicy } from '../../src/automation/question-policy.js';
import { createQuestionBrowser } from '../../src/automation/question-browser.js';
import { newBrowserWatchId } from '../../src/automation/question-browser-watch.js';
import { withHhBrowserScanFixture } from './e2e-hh-chat-scan.mjs';
import { noticePolicyHtml } from '../../../experiments/issue-56/notice-policy-browser-fixture.mjs';
import {
  noticeRule,
  noticeReply,
  noticeText,
  activeReview,
  botBinarySummary,
  botHandover,
  recognizedNoticeRule,
  russianThanks,
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
    {
      html: noticePolicyHtml(fixture),
      choiceReceiptMs: fixture.choiceReceiptMs ?? 100,
    },
    async ({ sender, page }) => {
      const store = createMemoryStore();
      await saveAnswerRule(store, noticeRule());
      if (fixture.savedThanks) {
        await saveAnswerRule(store, recognizedNoticeRule());
      }
      await saveAnswerPolicy(store, {
        notices: {
          acknowledgements: fixture.acknowledgements ?? 'reply',
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
  await verifyNoticeLink(engine, { screenshots, outcomes });
  await verifyNoticeEmployerChange(engine, { screenshots, outcomes });
  await verifyRecognizedNotice(engine, { screenshots, outcomes });
  await verifyNoticeReplyVisibility(engine, { screenshots, outcomes });
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

const frameNotice = (page, reverse = false) =>
  page.addStyleTag({
    content: `#history { height: 140px; overflow-anchor: none; ${reverse ? 'display: flex; flex-direction: column-reverse;' : ''} } #history article { box-sizing: border-box; flex: none; min-height: 112px; }`,
  });

const outgoingInNoticePane = (page) =>
  page.locator('[data-qa="chatik-chat-message-102"] p').evaluate((node) => {
    const text = node.getBoundingClientRect();
    const pane = node.closest('#history').getBoundingClientRect();
    return text.top >= pane.top && text.bottom <= pane.bottom;
  });

const checkedNoticeReceipt = async (status, page, store) => {
  const sent = await until(
    status,
    (s) => s.outbox?.receipt?.messageId === '102'
  );
  assert.equal(sent.outbox.receipt.text, noticeReply);
  assert.equal((await counts(page)).sends, 1);
  assert.equal((await listOutbox(store)).length, 1);
};

const verifyOwnerViewDuringNoticeReceipt = (
  engine,
  screenshots,
  outcomes,
  draft
) =>
  runNoticeCase(
    engine,
    screenshots,
    outcomes,
    draft
      ? 'owner-scroll-and-draft-during-receipt'
      : 'owner-focus-during-receipt',
    { choiceReceiptMs: 3000 },
    async ({ browser, input, status, page, store }) => {
      await frameNotice(page);
      await page.evaluate(() => {
        window.fixture.receipt = 'held';
      });
      await inactive(page);
      await browser.watchStart(input);
      await page.waitForFunction(() => Boolean(window.fixture.completeReceipt));
      await page.bringToFront();
      await page.waitForFunction(() => document.hasFocus());
      const history = page.locator('#history');
      if (draft) {
        await page.locator('textarea').fill(draft);
        await history.hover();
        await page.mouse.wheel(0, 35);
        await page.waitForFunction(
          () => document.querySelector('#history').scrollTop > 0
        );
      }
      const anchor = await history.evaluate((node) => node.scrollTop);
      await page.evaluate(() => window.fixture.completeReceipt());
      await checkedNoticeReceipt(status, page, store);
      assert.equal(await history.evaluate((node) => node.scrollTop), anchor);
      assert.equal(await page.locator('textarea').inputValue(), draft);
      assert.equal(await outgoingInNoticePane(page), false);
      await browser.watchStop(input);
      assert.equal((await counts(page)).sends, 1);
    }
  );

export const verifyNoticeReplyVisibility = async (
  engine,
  { screenshots, outcomes = [], before = false } = {}
) => {
  const clipped = [];
  for (const reverse of [false, true]) {
    const layout = reverse ? 'reversed' : 'ordinary';
    await runNoticeCase(
      engine,
      screenshots,
      outcomes,
      `receipt-visible-${layout}`,
      {},
      async ({ browser, input, status, page, store }) => {
        await frameNotice(page, reverse);
        const owner = await inactive(page);
        await browser.watchStart(input);
        await checkedNoticeReceipt(status, page, store);
        const inPane = await outgoingInNoticePane(page);
        if (screenshots) {
          await mkdir(screenshots, { recursive: true });
          await page.screenshot({
            path: join(
              screenshots,
              `${layout}-${before ? 'before' : 'after'}.png`
            ),
            fullPage: true,
          });
        }
        if (!inPane) {
          clipped.push(layout);
        }
        assert.equal(
          await owner.locator('textarea').inputValue(),
          'Owner unfinished draft'
        );
        await browser.watchStop(input);
      }
    );
  }
  assert.deepEqual(clipped, [], 'Confirmed outgoing text is clipped');
  await verifyOwnerViewDuringNoticeReceipt(engine, screenshots, outcomes, '');
  await verifyOwnerViewDuringNoticeReceipt(
    engine,
    screenshots,
    outcomes,
    'Owner edited while delivery was pending'
  );
  return { cases: outcomes.length, outcomes, liveProvider: false };
};

export const verifyRecognizedNotice = async (
  engine,
  { screenshots, outcomes = [], before = false } = {}
) => {
  await runNoticeCase(
    engine,
    screenshots,
    outcomes,
    'recognized-acknowledgement-after-completed-handover',
    {
      body: activeReview.replace(/\n/gu, '<br>'),
      earlier: [botBinarySummary, botHandover],
      savedThanks: true,
      compareHandover: true,
      acknowledgements: before ? 'reply' : 'reply-recognized',
    },
    async ({ browser, input, status, page, store }) => {
      await page.bringToFront();
      await browser.watchStart(input);
      await until(status, (s) => s.phase === 'owner-active');
      assert.equal((await counts(page)).sends, 0);
      assert.deepEqual(await listOutbox(store), []);
      const owner = await inactive(page);
      const result = await until(status, (s) =>
        before
          ? s.last?.plan.status === 'review'
          : s.outbox?.receipt?.messageId === '102'
      );
      if (!before) {
        assert.equal(result.outbox.receipt.text, russianThanks);
        assert.equal(
          await page.getByText(russianThanks, { exact: true }).isVisible(),
          true
        );
      }
      assert.equal((await counts(page)).sends, Number(!before));
      assert.equal((await listOutbox(store)).length, Number(!before));
      assert.equal((await counts(page)).choices, 0);
      assert.equal((await counts(page)).draft, '');
      assert.equal(
        await owner.locator('textarea').inputValue(),
        'Owner unfinished draft'
      );
      await browser.watchStop(input);
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({
          path: join(
            screenshots,
            before ? 'recognized-before.png' : 'recognized-after.png'
          ),
          fullPage: true,
        });
      }
    }
  );
  return { sends: Number(!before), liveProvider: false };
};

/** Native anchors with an unchanged visible label stay in owner review. */
export const verifyNoticeLink = async (
  engine,
  { screenshots, outcomes = [], before = false } = {}
) => {
  const destination = 'https://example.test/next';
  await runNoticeCase(
    engine,
    screenshots,
    outcomes,
    'notice-with-action-link',
    { body: `<a href="${destination}">${noticeText}</a>` },
    async ({ browser, input, status, page, store }) => {
      await inactive(page);
      await browser.watchStart(input);
      const receipt = await until(
        status,
        (s) =>
          s.last?.plan.historyVerified && ['review', 'sent'].includes(s.phase)
      );
      assert.deepEqual(receipt.last.snapshot.question.links, [destination]);
      assert.equal(receipt.last.snapshot.question.body, noticeText);
      assert.equal(receipt.phase, before ? 'sent' : 'review');
      assert.equal((await listOutbox(store)).length, Number(before));
      await browser.watchStop(input);
      const { sends, choices, draft } = await counts(page);
      assert.equal(sends, Number(before));
      assert.equal(choices, 0);
      assert.equal(draft, '');
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({
          path: join(
            screenshots,
            before ? 'native-before.png' : 'native-after.png'
          ),
          fullPage: true,
        });
      }
    }
  );
  return { sends: Number(before), liveProvider: false };
};

/** The shared pane guard must refuse a replacement employer before any send. */
export const verifyNoticeEmployerChange = async (
  engine,
  { screenshots, outcomes = [] } = {}
) => {
  await runNoticeCase(
    engine,
    screenshots,
    outcomes,
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
      // Active history capture rejects the observed replacement pane before
      // the text sender can compare its frozen notice context.
      assert.equal(paused.reason, 'answer-chat-unverified');
      assert.equal(paused.outbox.status, 'failed');
      assert.equal((await counts(page)).sends, 0);
      assert.equal((await counts(page)).choices, 0);
      assert.equal((await counts(page)).draft, '');
    }
  );
  return { cases: 1, liveProvider: false };
};
