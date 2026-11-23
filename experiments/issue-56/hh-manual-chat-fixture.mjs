import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeBrowserCommander } from 'browser-commander';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import {
  createBrowserSender,
  createDefaultSender,
} from '../../js/src/sources/browser-sender.js';
import { hhChoiceHtml } from './hh-choice-fixture.mjs';

export const installHhComposer = (page, delivery = 'delivered') =>
  page.evaluate((delivery) => {
    const button = document.querySelector('#send');
    button.dataset.qa = 'chat-send';
    button.onclick = () => {
      window.fixture.textSends++;
      const composer = document.querySelector('textarea');
      const row = document.createElement('article');
      row.dataset.qa = `chatik-chat-message-${101 + window.fixture.textSends}`;
      row.dataset.time = new Date().toISOString();
      const body = document.createElement('p');
      body.dataset.qa = 'chat-bubble-text';
      body.textContent = composer.value;
      const status = document.createElement('span');
      status.dataset.qa = `status-icon-${delivery}`;
      row.append(body, status);
      document.querySelector('#history').append(row);
      composer.value = '';
    };
  }, delivery);

export const openHhManualChatFixture = async (browser) => {
  const context = await browser.newContext();
  await context.route('**/*', (route) =>
    route.request().url() === 'https://hh.ru/chat/7'
      ? route.fulfill({ contentType: 'text/html', body: hhChoiceHtml })
      : route.abort()
  );
  const provider = await context.newPage();
  const commander = makeBrowserCommander({
    page: provider,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  const sender = createBrowserSender({
    choiceReceiptMs: 150,
    pollMs: 10,
    openSession: async () => ({
      commander,
      page: provider,
      close: () => context.close(),
    }),
  });
  const store = createMemoryStore();
  const dir = await mkdtemp(join(tmpdir(), 'ms-e2e-hh-manual-'));
  let server;
  const close = async () => {
    try {
      await server?.close();
    } finally {
      await sender.close();
      await context.close();
      await rm(dir, { recursive: true, force: true });
    }
  };
  try {
    const history = await sender.readRecent({ source: 'hh', chat: '7' });
    for (const message of history) {
      await store.put({ ...message, chatName: 'HeadHunter employer' });
    }
    await installHhComposer(provider);
    let apiWrites = 0;
    const send = createDefaultSender({
      browser: sender,
      getSource: () => ({
        live: {
          post: async () => {
            apiWrites++;
            throw Object.assign(
              new Error('The fixture API cannot send to a web chat'),
              { code: 'unsupported-action' }
            );
          },
        },
      }),
    });
    server = await startServer({
      store,
      storeDir: dir,
      port: 0,
      localUi: true,
      tls: true,
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: {
        send,
        scheduler: false,
        setTyping: async () => ({ supported: false }),
      },
    });
    return {
      base: `https://127.0.0.1:${server.port}`,
      close,
      provider,
      store,
      apiWrites: () => apiWrites,
    };
  } catch (error) {
    await close();
    throw error;
  }
};
