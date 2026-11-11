import { questionBrowserControlServer } from './question-browser-control.mjs';
import { pathToFileURL } from 'node:url';
import { makeBrowserCommander } from 'browser-commander';
import { createDefaultSender } from '../../js/src/sources/browser-sender.js';
import { startServer } from '../../js/src/server/index.js';
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
import { saveAnswerRule } from '../../js/src/automation/question-store.js';

/** Private, disposable production server and routed provider; no live account. */
export const questionBrowserServer = async (
  browser,
  { summaryChoices = false, noticePolicies = false } = {}
) => {
  const env = await questionBrowserFixture();
  if (noticePolicies) {
    env.state.snapshot.question.body = noticeText;
    await saveAnswerRule(env.store, noticeRule());
  }
  const setSummary = async (answer = 'Yes') => {
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
  if (summaryChoices) {
    await setSummary();
  }

  await seedQuestionBrowserChat(env);
  const context = await browser.newContext({
    viewport: { width: 1000, height: 800 },
  });
  const page = await context.newPage();
  let mode = { id: '101' };
  await context.route('**/*', (route) => {
    if (
      !['https://hh.ru', 'https://chatik.hh.ru'].includes(
        new URL(route.request().url()).origin
      )
    ) {
      return route.abort();
    }
    return route.fulfill({
      contentType: 'text/html',
      body: `${(noticePolicies
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
  const server = await startServer({
    store: env.store,
    port: 0,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false, send },
    log: null,
  });
  const reset = async (next = {}) => {
    mode = { id: String(Number(mode.id) + 100), ...next };
    await page.goto('https://hh.ru/chat/7');
    await seedQuestionBrowserRead(env.store);
    return mode;
  };
  await reset({ id: '101', ...(noticePolicies ? { freeText: true } : {}) });
  const stats = () =>
    page.evaluate(() => ({
      clicks: window.fixture.clicks,
      textSends: window.fixture.textSends,
      draft: document.querySelector('textarea').value,
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
