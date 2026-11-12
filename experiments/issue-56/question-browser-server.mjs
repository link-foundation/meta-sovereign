import { questionBrowserControlServer } from './question-browser-control.mjs';
import { pathToFileURL } from 'node:url';
import { makeBrowserCommander } from 'browser-commander';
import { createDefaultSender } from '../../js/src/sources/browser-sender.js';
import { startQuestionFixtureServer } from '../../js/tests/helpers/question-fixture-server.mjs';
import {
  questionBrowserFixture,
  seedQuestionBrowserChat,
  seedQuestionBrowserRead,
} from './question-browser-fixture.mjs';
import { summaryChoiceMessage } from './summary-choice-fixture.mjs';
import { hhChoiceHtml } from './hh-choice-fixture.mjs';
import { textReplyHtml } from './text-reply-fixture.mjs';
import { noticePolicyHtml } from './notice-policy-browser-fixture.mjs';
import { noticeText, noticeRule } from './notice-fixture.mjs';
import { chatNavigationHtml } from './chat-navigation-fixture.mjs';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { saveAnswerPolicy } from '../../js/src/automation/question-policy.js';
import { rejectionText } from './notice-policy-fixture.mjs';

const unreadTrace = (enabled) => (message) => {
  if (enabled && process.env.MS_BROWSER_CHAT_VIEW_DEBUG === '1') {
    console.error(message);
  }
};

const traceUnreadNavigation = (page, enabled) => {
  if (enabled && process.env.MS_BROWSER_CHAT_VIEW_DEBUG === '1') {
    page.on('framenavigated', (frame) =>
      console.error('[question-unread-frame]', frame.url())
    );
  }
};

const summarySetter =
  (env) =>
  async (answer = 'Yes') => {
    if (!['Yes', 'No', 'conflict', 'none'].includes(answer)) {
      throw new Error('Unknown synthetic summary answer');
    }
    await env.store.delete('qa-rule:experience');
    await env.store.delete('msg:hh:accepted:20');
    await env.store.delete('msg:vk:accepted:21');
    if (answer !== 'none') {
      await env.store.put(
        summaryChoiceMessage({
          body: `Your answers:\n${env.state.snapshot.question.body}: ${answer === 'conflict' ? 'Yes' : answer}.`,
        })
      );
    }
    if (answer === 'conflict') {
      await env.store.put(
        summaryChoiceMessage({
          id: 'msg:vk:accepted:21',
          source: 'vk',
          body: `Your answers:\n${env.state.snapshot.question.body}: No.`,
        })
      );
    }
    return { summary: answer };
  };

/** Private, disposable production server and routed provider; no live account. */
export const questionBrowserServer = async (
  browser,
  {
    summaryChoices = false,
    noticePolicies = false,
    unreadReview = false,
    unreadNotices = false,
  } = {}
) => {
  const env = await questionBrowserFixture();
  if (unreadReview) {
    await saveAnswerRule(env.store, {
      id: 'start-time',
      question: 'What time can you start?',
      answers: [{ text: 'At 9 a.m.', approved: true }],
    });
  }
  if (noticePolicies || unreadNotices) {
    env.state.snapshot.question.body = noticeText;
    await saveAnswerRule(env.store, noticeRule());
  }
  if (unreadNotices) {
    await saveAnswerPolicy(env.store, {
      notices: {
        acknowledgements: 'reply',
        rejections: 'reply',
        rejectionReply: 'May I ask why?',
      },
    });
  }
  const setSummary = summarySetter(env);
  if (summaryChoices) {
    await setSummary();
  }

  await seedQuestionBrowserChat(env);
  const context = await browser.newContext({
    viewport: { width: 1000, height: 800 },
  });
  const page = await context.newPage();
  traceUnreadNavigation(page, unreadReview);
  let inactiveView;
  let mode = { id: '101' };
  await context.route('**/*', (route) => {
    if (localBase && new URL(route.request().url()).origin === localBase) {
      return route.continue();
    }
    if (
      !['https://hh.ru', 'https://chatik.hh.ru'].includes(
        new URL(route.request().url()).origin
      )
    ) {
      return route.abort();
    }
    return route.fulfill({
      contentType: 'text/html',
      body: unreadReview
        ? chatNavigationHtml({
            ...mode,
            ...(unreadNotices
              ? {
                  textReplies: true,
                  precedingOutgoing: true,
                  latestMessages: { 8: noticeText, 9: rejectionText },
                }
              : {}),
          })
        : `${(noticePolicies
            ? noticePolicyHtml()
            : mode.freeText
              ? textReplyHtml
              : hhChoiceHtml
          ).replaceAll(
            'message-101',
            `message-${mode.id}`
          )}<script>mountChoices(['Yes','No']);fixture.receipt=${JSON.stringify(mode.receipt ?? 'normal')};document.querySelector('textarea').value=${JSON.stringify(mode.draft ?? '')};${mode.freeText ? "document.querySelector('#choices').replaceChildren();document.querySelector('#choices').className='';" : ''}</script>`,
    });
  });
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  const send = createDefaultSender({
    log: unreadTrace(unreadReview),
    browser: {
      store: env.store,
      pollMs: 10,
      loginTimeoutMs: 300,
      choiceReceiptMs: 100,
      openSession: async () => ({
        page,
        commander,
        close: () => context.close(),
      }),
    },
  });
  const server = await startQuestionFixtureServer(
    { store: env.store, send },
    true
  );
  const localBase = `http://127.0.0.1:${server.port}`;
  const reset = async (next = {}) => {
    mode = { id: String(Number(mode.id) + 100), ...next };
    await page.goto('https://hh.ru/chat/7');
    if (unreadReview) {
      await send.readRecent({ source: 'hh', chat: '7' });
      await page.evaluate(() =>
        window.history.replaceState({}, '', '/chat/7?owner=review#reading')
      );
      inactiveView ??= await context.newPage();
      await inactiveView.bringToFront();
    }
    await seedQuestionBrowserRead(env.store);
    return mode;
  };
  await reset({ id: '101', ...(noticePolicies ? { freeText: true } : {}) });
  const stats = () =>
    page.evaluate(() => ({
      clicks: window.fixture.clicks,
      textSends: window.fixture.textSends,
      draft: document.querySelector('textarea').value,
      ...(window.fixture.visits
        ? {
            visits: window.fixture.visits,
            sends: window.fixture.sends,
            replies: window.fixture.replies,
          }
        : {}),
    }));
  return {
    base: `http://127.0.0.1:${server.port}`,
    page,
    store: env.store,
    send,
    reset,
    setSummary,
    stats,
    close: async () => {
      await server.close();
      await context.close();
    },
  };
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    executablePath:
      process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  const fixture = await questionBrowserServer(browser, {
    summaryChoices: process.env.QUESTION_BROWSER_SUMMARY === '1',
    noticePolicies: process.env.QUESTION_BROWSER_NOTICES === '1',
    unreadReview: process.env.QUESTION_BROWSER_UNREAD === '1',
  });
  const controls = questionBrowserControlServer(fixture);
  await new Promise((resolve) => controls.listen(0, '127.0.0.1', resolve));
  console.log(
    JSON.stringify({
      base: fixture.base,
      control: `http://127.0.0.1:${controls.address().port}`,
    })
  );
  const close = async () => {
    await new Promise((resolve) => controls.close(resolve));
    await fixture.close();
    await browser.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
