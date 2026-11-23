import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../src/server/index.js';
import { createMemoryStore } from '../../src/storage/universal.js';
import { decodeWire, LINO_TEXT } from '../../src/transport/lino.js';
import { launchHhImportFixture } from './e2e-hh-browser-import.mjs';
import { createWirePost } from './http-wire.mjs';

const jobState = (page, state) =>
  page.locator(`[data-auto-import-state="${state}"]`);

const receipt = (response) =>
  response.request().method() === 'POST' &&
  new URL(response.url()).pathname === '/api/message/read';

const readReceipt = async (response) =>
  decodeWire(await response.body(), response.headers()['content-type']);

const capture = async (page, base, provider, url) => {
  await page.goto(`${base}/#conn-hh`);
  await jobState(page, 'waiting').waitFor();
  await provider.goto(url);
  const button = page.getByRole('button', { name: 'Capture this chat' });
  const response = page.waitForResponse((r) => r.url().endsWith('/capture'));
  await button.click();
  assert.equal((await response).status(), 200);
  await jobState(page, 'waiting').waitFor();
};

const screenshot = (page, state) =>
  process.env.HH_IMPORT_READ_SCREENSHOTS === '1'
    ? page.screenshot({
        path: `docs/screenshots/issue-56-hh-browser-import-read-${state}.png`,
      })
    : Promise.resolve();

const operatorRead = async ({ page, base, provider, store }) => {
  const composer = provider.getByRole('textbox', { name: 'Provider composer' });
  await composer.fill('Unsent owner draft');
  await composer.evaluate((element) => element.setSelectionRange(2, 8));
  await page.goto(`${base}/#/operator`);
  await page.locator('[data-operator-chat="hh:web:7"]').waitFor();
  await page.locator('[data-row="msg:hh:web:7:101"]').waitFor();
  const response = page.waitForResponse(receipt);
  await page.locator('[data-action="operator-done"]').click();
  const result = await response;
  if (process.env.HH_IMPORT_READ_BEFORE === '1') {
    await page
      .getByText('Could not mark this conversation read.', { exact: false })
      .waitFor();
    await screenshot(page, 'before');
  }
  assert.equal(result.status(), 200, 'Operator receives the native receipt');
  const body = await readReceipt(result);
  assert.equal(body.read, true);
  assert.equal(body.readState.id, 'read:hh:web:7');
  assert.equal((await store.get('read:hh:web:7')).unreadCount, 0);
  assert.deepEqual(
    await composer.evaluate((element) => [
      element.value,
      element.selectionStart,
      element.selectionEnd,
    ]),
    ['Unsent owner draft', 2, 8]
  );
  assert.equal(await provider.evaluate(() => globalThis.fixture.reads), 1);
  await page
    .locator('[data-operator-chat="hh:web:7"]')
    .waitFor({ state: 'hidden' });
  await screenshot(page, 'after');
};

const rejectOtherPanes = async (base, provider, store) => {
  const post = createWirePost(base, '/api/message', LINO_TEXT);
  for (const url of [
    'https://hh.ru/chat/8?read-import',
    'https://hh.ru/chat/7?read-import&second-chat',
  ]) {
    await provider.goto(url);
    const { answer } = await post('/read', { ids: ['msg:hh:web:7:101'] });
    assert.equal(answer.code, 'answer-chat-unverified');
    assert.equal(await provider.evaluate(() => globalThis.fixture.reads), 0);
    assert.equal((await store.get('read:hh:web:7')).unreadCount, 2);
  }
};

const chatRead = async ({ page, provider, store }) => {
  await page.evaluate(() => {
    globalThis.localStorage.setItem('metaSovereignReadReceipts', 'on');
    globalThis.location.hash = '/chat';
  });
  const row = page.locator('[data-chat="hh:web:7"]');
  await row.locator('[data-unread="2"]').waitFor();
  const response = page.waitForResponse(receipt);
  await row.click();
  assert.equal((await readReceipt(await response)).read, true);
  await row.locator('[data-unread="2"]').waitFor({ state: 'hidden' });
  assert.equal((await store.get('read:hh:web:7')).unreadCount, 0);
  assert.equal(await provider.evaluate(() => globalThis.fixture.reads), 1);
};

export const verifyHhImportRead = async (page) => {
  const store = createMemoryStore();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hh-import-read-'));
  let provider;
  let opens = 0;
  const server = await startServer({
    port: 0,
    tls: false,
    localUi: true,
    storeDir: dir,
    store,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: {
      scheduler: false,
      browser: {
        openSession: () => {
          opens += 1;
          throw new Error('This operation must use the open import browser');
        },
      },
    },
    autoImportLauncher: async ({ url }) => {
      const session = await launchHhImportFixture(page.context(), url);
      provider = session.page;
      return session;
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    await page.goto(`${base}/#conn-hh`);
    await page.getByRole('button', { name: 'Open browser' }).click();
    await jobState(page, 'waiting').waitFor();
    const url = 'https://hh.ru/chat/7?read-import';
    await capture(page, base, provider, url);
    const state = { page, base, provider, store };
    await operatorRead(state);
    await capture(page, base, provider, url);
    await rejectOtherPanes(base, provider, store);
    await provider.goto(url);
    await chatRead(state);
    assert.equal(opens, 0);
    assert.equal(await store.get('secret:hh:access-token'), null);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
};
