// Real browser e2e for the interface scale and the connection proxy
// (R-Y192), as Telegram Desktop has them: Settings → Interface scale picks
// a step (the page's font size follows, and the message text with it) and
// the choice survives a reload; Settings → Connection type saves SOCKS5
// and MTProto through the real routes and proxy actions on a memory store
// (the password and secret never come back, the page only sees "set"), a
// Check asks a fake probe; a t.me/proxy link in a chat opens the same
// dialog prefilled and saves nothing until Save. Telegram itself is not
// there: the account is only the proxy actions, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:scale-proxy

import { createMemoryStore } from '../src/storage/universal.js';
import { createProxy, readProxy } from '../src/sources/telegram-proxy.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '51';
const SECRET = '00112233445566778899aabbccddeeff';
const LINK_SECRET = 'ffeeddccbbaa99887766554433221100';
const PASSWORD = 'correct-horse-battery';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHAT}:1`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Proxy Friend',
  chatType: 'private',
  sender: CHAT,
  senderName: 'Proxy Friend',
  body: `use https://t.me/proxy?server=link.example.org&port=8443&secret=${LINK_SECRET} please`,
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

// The proxy actions are the real ones, over their own memory store.
const proxyStore = createMemoryStore();
const probes = [];
const reconnects = [];
const proxy = createProxy({
  store: proxyStore,
  connection: { disconnect: async () => reconnects.push('disconnect') },
  reopen: async () => reconnects.push('reopen'),
  proxyProbe: async (what) => {
    probes.push(what);
    return { reachable: what.port === 1080, ms: 12 };
  },
});

const account = { ...proxy, stop: async () => {} };
const { base, page, until, finish } = await openChatApp('scale-proxy', {
  store,
  telegramAccount: account,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);

// Every proxy exchange, to prove no secret travels back to the page.
const sent = [];
const answers = [];
page.on('request', (request) => {
  if (request.url().includes('/api/telegram/proxy-save')) {
    sent.push(request.postDataJSON());
  }
});
page.on('response', async (response) => {
  if (response.url().includes('/api/telegram/proxy-')) {
    answers.push(await response.text().catch(() => ''));
  }
});

const htmlSize = () =>
  page.evaluate(
    () => globalThis.getComputedStyle(document.documentElement).fontSize
  );
const bubbleSize = async () =>
  parseFloat(
    await page
      .locator('.bubble')
      .first()
      .evaluate((node) => globalThis.getComputedStyle(node).fontSize)
  );
const openSettings = () => page.locator('button[data-view="settings"]').click();
const dialog = page.locator('[data-dialog="proxy"]');
const field = (name) => dialog.locator(`[data-field="proxy-${name}"]`);
const gone = () => until(async () => (await dialog.count()) === 0, 'closed');

const scaleSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.bubble').first().waitFor({ timeout: 15000 });
  assert((await htmlSize()) === '16px', `starts at 100%: ${await htmlSize()}`);
  const before = await bubbleSize();

  await openSettings();
  const select = page.locator('[data-action="ui-scale"]');
  await select.waitFor({ timeout: 10000 });
  assert(
    (await select.locator('option').allTextContents()).join() ===
      'Auto,100%,110%,125%,150%,175%,200%',
    'Desktop steps'
  );
  await select.selectOption('150');
  await until(async () => (await htmlSize()) === '24px', '150% is 24px');
  // The message text size slider (a native range, set as a user would).
  await page.locator('[data-action="text-size"]').evaluate((input) => {
    const set = Object.getOwnPropertyDescriptor(
      globalThis.HTMLInputElement.prototype,
      'value'
    ).set;
    set.call(input, '18');
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    input.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  });
  await until(
    async () =>
      (await page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--chat-font-size')
      )) === '1.125rem',
    'text size 18 px'
  );

  // It survives a reload, and the messages are larger.
  await page.reload();
  await until(async () => (await htmlSize()) === '24px', 'kept after reload');
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.bubble').first().waitFor({ timeout: 15000 });
  const after = await bubbleSize();
  assert(
    after === 27 && after > before,
    `text 18px at 150%: ${before} → ${after}`
  );
  await openSettings();
  assert(
    (await page.locator('[data-action="ui-scale"]').inputValue()) === '150',
    'the select shows the kept scale'
  );
  assert(
    (
      await page.evaluate(() =>
        globalThis.localStorage.getItem('metaSovereignUiScale')
      )
    ).includes('"scale":150'),
    'kept in localStorage'
  );
  // Back to Auto, so the rest runs at 100%.
  await page.locator('[data-action="ui-scale"]').selectOption('auto');
  await page.locator('[data-action="text-size-default"]').click();
  await until(async () => (await htmlSize()) === '16px', 'Auto is 100%');
};

const proxySteps = async () => {
  await openSettings();
  await page.locator('[data-proxy-summary="none"]').waitFor({ timeout: 10000 });
  await page.locator('[data-action="open-proxy"]').click();
  await dialog.waitFor({ timeout: 5000 });

  // SOCKS5: a bad host is refused by the server, nothing is kept.
  await dialog.locator('[data-action="proxy-kind-socks5"]').check();
  await field('host').fill('https://bad.example');
  await field('port').fill('1080');
  await dialog.locator('[data-action="proxy-save"]').click();
  await dialog
    .locator('[data-proxy-error="bad-host"]')
    .waitFor({ timeout: 5000 });
  assert((await readProxy(proxyStore)) === null, 'a bad host saves nothing');

  await field('host').fill('socks.example.org');
  await field('username').fill('me');
  await field('password').fill(PASSWORD);
  await dialog.locator('[data-action="proxy-check"]').click();
  await dialog.locator('[data-proxy-check="ok"]').waitFor({ timeout: 5000 });
  assert(
    probes.length === 1 && probes[0].host === 'socks.example.org',
    `the probe asked: ${JSON.stringify(probes)}`
  );
  await dialog.locator('[data-action="proxy-save"]').click();
  await gone();
  const socks = await readProxy(proxyStore);
  assert(
    socks?.kind === 'socks5' &&
      socks.port === 1080 &&
      socks.password === PASSWORD,
    `SOCKS5 kept: ${JSON.stringify(socks)}`
  );
  await page
    .locator('[data-proxy-summary="socks5"]')
    .waitFor({ timeout: 5000 });
  assert(
    reconnects.join() === 'disconnect,reopen',
    `reconnected: ${reconnects}`
  );

  // Opened again: the password is not there, only that it is set.
  await page.locator('[data-action="open-proxy"]').click();
  await dialog.waitFor({ timeout: 5000 });
  await until(
    async () => (await field('host').inputValue()) === 'socks.example.org',
    'the saved host is shown'
  );
  assert((await field('password').inputValue()) === '', 'no password shown');
  assert(
    (await field('password').getAttribute('placeholder')) !== null,
    'it says the password is set'
  );

  // MTProto.
  await dialog.locator('[data-action="proxy-kind-mtproto"]').check();
  await field('host').fill('mt.example.org');
  await field('port').fill('443');
  await field('secret').fill(SECRET);
  await dialog.locator('[data-action="proxy-save"]').click();
  await gone();
  const mt = await readProxy(proxyStore);
  assert(
    mt?.kind === 'mtproto' && mt.secret === SECRET && mt.port === 443,
    `MTProto kept: ${JSON.stringify(mt)}`
  );
  await page
    .locator('[data-proxy-summary="mtproto"]')
    .waitFor({ timeout: 5000 });

  assert(sent.length === 3, `three saves were sent: ${sent.length}`);
  const text = answers.join('\n');
  assert(answers.length >= 4, 'the page read and saved through the routes');
  assert(
    !text.includes(PASSWORD) && !text.includes(SECRET),
    'no answer holds the password or the secret'
  );
  assert(text.includes('"secretSet":true'), 'only "set" is told');
};

const linkSteps = async () => {
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  const link = page.locator('a.msg-link[href*="t.me/proxy"]').first();
  await link.waitFor({ timeout: 15000 });
  const popups = [];
  page.context().on('page', (p) => popups.push(p.url()));
  await link.click();
  await dialog.waitFor({ timeout: 5000 });
  assert(popups.length === 0, 'the browser did not open the link');
  await dialog.locator('[data-proxy-from-link]').waitFor({ timeout: 5000 });
  assert(
    (await field('host').inputValue()) === 'link.example.org' &&
      (await field('port').inputValue()) === '8443' &&
      (await field('secret').inputValue()) === LINK_SECRET,
    'the dialog is prefilled from the link'
  );
  assert(
    await dialog.locator('[data-action="proxy-kind-mtproto"]').isChecked(),
    'MTProto is chosen'
  );
  // Nothing is saved until Save.
  assert(
    (await readProxy(proxyStore)).host === 'mt.example.org',
    'the link saved nothing'
  );
  await dialog.locator('[data-action="cancel"]').click();
  await gone();
  assert(
    (await readProxy(proxyStore)).host === 'mt.example.org',
    'Cancel saved nothing'
  );
  await link.click();
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-action="proxy-save"]').click();
  await gone();
  assert(
    (await readProxy(proxyStore)).host === 'link.example.org',
    "Save keeps the link's proxy"
  );
};

await finish(async () => {
  await scaleSteps();
  await proxySteps();
  await linkSteps();
});
