/* global DOMParser, history */
import assert from 'node:assert/strict';
import { makeBrowserCommander } from 'browser-commander';
import { createBrowserSender } from '../../src/sources/browser-sender.js';
import { readBrowserHistory } from '../../src/sources/browser-choices.js';
import { HH_WEB_UI } from '../../src/sources/hh-web-ui.js';
import { archiveBrowserHistoryWindow } from '../../src/sources/browser-history-archive.js';
import { rememberAssignmentVacancy } from '../../src/assignments/vacancy-association.js';
import { createMemoryStore } from '../../src/storage/universal.js';
import {
  withMessageVersions,
  messageVersions,
} from '../../src/storage/message-versions.js';
import { hhChoiceHtml } from '../../../experiments/issue-56/hh-choice-fixture.mjs';
import { transientMessageFixture } from '../../../experiments/issue-56/transient-message-fixture.mjs';
import { nativeAssignmentChatHtml } from '../../../experiments/issue-56/assignment-native-chat-fixture.mjs';
import { vacancyUrl } from '../../../experiments/issue-56/assignment-vacancy-fixture.mjs';

const fixture = async (browser) => {
  const context = await browser.newContext();
  await context.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html', body: hhChoiceHtml })
  );
  const page = await context.newPage();
  const errors = [];
  let finalCounters;
  const counters = () =>
    finalCounters ??
    page.evaluate(() => ({
      clicks: window.fixture.clicks,
      text: window.fixture.textSends,
    }));
  page.on('pageerror', (error) => errors.push(error.message));
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  const sender = createBrowserSender({
    pollMs: 10,
    loginTimeoutMs: 300,
    choiceReceiptMs: 100,
    openSession: async () => ({
      commander,
      page,
      async close() {
        finalCounters = await counters();
        await context.close();
      },
    }),
  });
  const args = { source: 'hh', chat: '7' };
  await sender.readRecent(args);
  return { page, sender, commander, args, counters, errors };
};

const runFixture = async (browser, name, work, failures, collectFailures) => {
  const env = await fixture(browser);
  try {
    await work(env);
    assert.deepEqual(env.errors, []);
    assert.deepEqual(await env.counters(), { clicks: 0, text: 0 });
    console.log(`[hh-live-capture] PASS ${name}`);
    return 1;
  } catch (error) {
    if (!collectFailures) {
      throw error;
    }
    failures.push(name);
    console.error(`[hh-live-capture] FAIL ${name}: ${error.message}`);
    return 0;
  } finally {
    await env.sender.close();
  }
};

export const verifyHhAssignmentVacancyWatch = (browser) =>
  runFixture(
    browser,
    'associates a form when its native header mounts',
    async ({ page, sender, args }) => {
      const store = createMemoryStore();
      const formUrl = 'https://forms.gle/fixture-native-watch';
      const markup = nativeAssignmentChatHtml(formUrl);
      await page.evaluate((html) => {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const selector = '[data-qa="chat-bubble-text"]';
        document
          .querySelector(selector)
          .replaceWith(parsed.querySelector(selector));
      }, markup);
      const watch = await sender.openAnswerWatch({
        ...args,
        onHistoryWindow: (window) =>
          archiveBrowserHistoryWindow(store, { ...window, source: 'hh' }),
      });
      try {
        assert.equal(await rememberAssignmentVacancy(store, [formUrl]), null);
        await page.evaluate((html) => {
          const parsed = new DOMParser().parseFromString(html, 'text/html');
          document.body.prepend(parsed.querySelector('header'));
        }, markup);
      } finally {
        await watch.close();
      }
      const association = await rememberAssignmentVacancy(store, [formUrl]);
      assert.equal(association?.vacancyUrl, vacancyUrl);
      assert.equal(association?.sourceMessageId, 'msg:hh:7:101');
      assert.equal(await page.locator('textarea').inputValue(), '');
    }
  );

/** Finite actual DOM mutations between polls; every provider request is routed. */
export const verifyHhLiveCapture = async (
  browser,
  { collectFailures = false } = {}
) => {
  const failures = [];
  let cases = 0;
  const run = async (name, work) => {
    cases += await runFixture(browser, name, work, failures, collectFailures);
  };
  await run(
    'transient edited and delivered messages survive without a polling read',
    async ({ page, sender, args }) => {
      const store = withMessageVersions(createMemoryStore());
      const watch = await sender.openAnswerWatch({
        ...args,
        onHistoryWindow: (window) =>
          archiveBrowserHistoryWindow(store, { ...window, source: 'hh' }),
      });
      try {
        await page.evaluate(transientMessageFixture, {
          root: '#history',
          id: '102',
        });
      } finally {
        await watch.close();
      }
      const saved = await store.get('msg:hh:7:102');
      assert.equal(saved?.body, 'Final answer');
      assert.equal(saved.delivery, 'delivered');
      assert.deepEqual(
        new Set(
          (await messageVersions(store, saved.id)).versions.map(
            (v) => v.snapshot.body
          )
        ),
        new Set(['First answer', 'Edited answer', 'Final answer'])
      );
      assert.equal(
        await page.evaluate(() =>
          Boolean(
            window[Symbol.for('meta-sovereign.browser-history-observer.v1')]
          )
        ),
        false
      );
    }
  );
  await run(
    'URL-before-pane transition refuses attribution and preserves the original owner',
    async ({ page, commander }) => {
      await page.evaluate(() => history.pushState({}, '', '/chat/8'));
      await assert.rejects(readBrowserHistory(commander, HH_WEB_UI, '8'), {
        code: 'answer-chat-unverified',
      });
      await page.evaluate(() => history.back());
    }
  );
  await run(
    'changed native header refuses prefill and capture before provider effects',
    async ({ page, sender, args, commander }) => {
      await page.evaluate(() => {
        const header = document.createElement('header');
        header.innerHTML =
          '<b data-qa="participant-info-title">Employer A</b><div data-qa="chatik-header-sub-header">Engineer<a href="https://hh.ru/vacancy/42">Vacancy</a></div>';
        document.body.prepend(header);
      });
      const expected = await sender.readAnswerChoices(args);
      const watch = await sender.openAnswerWatch({
        ...args,
        onHistoryWindow: async () => {},
      });
      try {
        await page
          .locator('[data-qa="participant-info-title"]')
          .evaluate((node) => {
            node.textContent = 'Employer B';
          });
        await assert.rejects(readBrowserHistory(commander, HH_WEB_UI, '7'), {
          code: 'answer-chat-unverified',
        });
        await assert.rejects(
          watch.prefill(expected, 'Unwanted answer', async () => {}),
          { code: 'answer-chat-unverified' }
        );
        assert.equal(await page.locator('textarea').inputValue(), '');
      } finally {
        await watch.close();
      }
    }
  );
  await run(
    'refused live archive pauses before any further prefill',
    async ({ page, sender, args }) => {
      let writes = 0;
      const expected = await sender.readAnswerChoices(args);
      const watch = await sender.openAnswerWatch({
        ...args,
        onHistoryWindow() {
          if (++writes > 1) {
            throw new Error('Private provider text must stay private');
          }
        },
      });
      try {
        await page.locator('[data-qa="chat-bubble-text"]').evaluate((node) => {
          node.textContent += ' Edited?';
        });
        await assert.rejects(
          watch.prefill(expected, 'Unwanted answer', async () => {}),
          { code: 'question-history-save-failed' }
        );
        assert.equal(await page.locator('textarea').inputValue(), '');
        await assert.rejects(sender.close(), {
          code: 'question-history-save-failed',
        });
        assert.equal(page.isClosed(), true);
      } finally {
        await watch
          .close()
          .catch((error) =>
            assert.equal(error.code, 'question-history-save-failed')
          );
      }
    }
  );
  return { cases, failures, liveProvider: false };
};
