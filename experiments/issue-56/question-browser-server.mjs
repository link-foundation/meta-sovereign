import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { makeBrowserCommander } from 'browser-commander';
import { createDefaultSender } from '../../js/src/sources/browser-sender.js';
import { startServer } from '../../js/src/server/index.js';
import { questionBrowserFixture } from './question-browser-fixture.mjs';
import { hhChoiceHtml } from './hh-choice-fixture.mjs';

/** Private, disposable production server and routed provider; no live account. */
export const questionBrowserServer = async (browser) => {
  const env = await questionBrowserFixture();
  await env.store.put({
    id: 'msg:hh:7:101',
    tokens: ['message', 'hh', '7'],
    source: 'hh',
    chat: '7',
    chatName: 'Employer bot fixture',
    chatType: 'bot',
    sender: 'recruiter',
    body: env.state.snapshot.question.body,
    timestamp: new Date().toISOString(),
  });
  await env.store.put({
    id: 'read:hh:7',
    tokens: ['read', 'hh', '7'],
    kind: 'read',
    source: 'hh',
    chat: '7',
    inboxMaxId: 100,
    unreadTopId: 101,
    unreadCount: 1,
  });
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
      body: `${hhChoiceHtml.replaceAll(
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
    await env.store.put({
      id: 'read:hh:7',
      tokens: ['read', 'hh', '7'],
      kind: 'read',
      source: 'hh',
      chat: '7',
      inboxMaxId: 100,
      unreadTopId: 101,
      unreadCount: 1,
    });
    return mode;
  };
  await reset({ id: '101' });
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
  const fixture = await questionBrowserServer(browser);
  const controls = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let result;
      if (url.pathname === '/reset') {
        result = await fixture.reset(Object.fromEntries(url.searchParams));
      } else {
        result = await fixture.stats();
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 500;
      res.end(error.message);
    }
  });
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
