// Real browser e2e for a bot's mini apps (R-Y168), as Telegram Desktop
// opens them: the bot's menu button (with its text) opens a window with
// the app in a sandboxed frame; the app says it is ready and shows its
// MainButton, which appears at the bottom and whose click reaches the
// app; the app's pop-up is drawn by the page and its answer returned; the
// app closes itself; a reply-keyboard app sends its data (recorded by the
// fake server) and closes; an inline-keyboard button and a t.me/bot/app
// link open apps too; and messages from any other frame are ignored. The
// app is a fake page of another (https) origin answered inside the browser
// — nothing reaches a network or a running app. Telegram's answers are
// faked in the page, chats live in a memory store, a server on a free port,
// a headless browser. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:web-apps

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const MENU = '8';
const KB = '9';
const INL = '10';
const ORIGIN = 'https://miniapp.test';
const row = (...buttons) => ({ className: 'KeyboardButtonRow', buttons });
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const message = (chat, name, n, body, raw = {}) => ({
  id: `msg:telegram:${chat}:${n}`,
  source: 'telegram',
  chat,
  chatName: name,
  chatType: 'user',
  sender: chat,
  senderName: name,
  body,
  timestamp: at(n),
  raw: { id: n, ...raw },
});
await store.put(
  message(
    MENU,
    'Fake App Bot',
    1,
    'Try https://t.me/fake_app_bot/shop?startapp=promo now'
  )
);
await store.put(
  message(KB, 'Fake Keyboard Bot', 1, 'Pick', {
    replyMarkup: {
      className: 'ReplyKeyboardMarkup',
      rows: [
        row({
          className: 'KeyboardButtonSimpleWebView',
          text: 'Pick one',
          url: `${ORIGIN}/kb`,
        }),
      ],
    },
  })
);
await store.put(
  message(INL, 'Fake Inline Bot', 1, 'Shop', {
    replyMarkup: {
      className: 'ReplyInlineMarkup',
      rows: [
        row({
          className: 'KeyboardButtonWebView',
          text: 'Open shop',
          url: `${ORIGIN}/inline`,
        }),
      ],
    },
  })
);

// The fake app: another origin, answered by the browser itself. It posts
// what the documented SDK posts, records what the page posts to it, and
// acts on a few of them (by its path).
const APP = `<!doctype html><meta charset="utf-8"><title>fake app</title>
<p id="hi">hello from the app</p>
<script>
window.got = [];
const send = (t, d = '') =>
  parent.postMessage(JSON.stringify({ eventType: t, eventData: d }), '*');
const kind = location.pathname.slice(1);
addEventListener('message', (e) => {
  let m = {};
  try { m = JSON.parse(e.data); } catch {}
  window.got.push(m);
  if (m.eventType === 'main_button_pressed') {
    if (kind === 'kb') {
      send('web_app_data_send', { data: '{"pick":1}' });
    } else {
      send('web_app_open_popup', {
        title: 'Order',
        message: 'Place the order?',
        buttons: [{ id: 'yes', type: 'default', text: 'Yes' }, { type: 'cancel' }],
      });
    }
  }
  if (m.eventType === 'popup_closed' && m.eventData.button_id === 'yes') {
    send('web_app_setup_back_button', { is_visible: true });
  }
  if (m.eventType === 'back_button_pressed') {
    send('web_app_close');
  }
  if (m.eventType === 'ping') {
    send('web_app_setup_secondary_button', {
      is_visible: true, text: 'Real', position: 'left',
    });
  }
});
send('iframe_ready', { reload_supported: true });
send('web_app_request_theme');
send('web_app_request_viewport');
send('web_app_ready');
send('web_app_setup_main_button', {
  is_visible: true, is_active: true, is_progress_visible: false,
  text: 'Order now', color: '#2481cc', text_color: '#ffffff',
});
send('web_app_trigger_haptic_feedback', { type: 'impact' });
</script>`;

const { base, page, until, finish } = await openChatApp('web-apps', { store });

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = String(route.request().postDataJSON()?.chat ?? '');
  return fulfil(route, { chat, kind: 'user', title: 'Fake Bot', bot: true });
});
await page.route('**/api/telegram/bot-commands', (route) =>
  fulfil(route, {
    ok: true,
    commands: [],
    menu:
      String(route.request().postDataJSON()?.chat) === MENU
        ? { kind: 'webapp', text: 'Open app', url: `${ORIGIN}/menu` }
        : { kind: 'default' },
  })
);
const opened = [];
const sentData = [];
let prolonged = 0;
await page.route('**/api/telegram/web-app-open', (route) => {
  const body = route.request().postDataJSON();
  opened.push(body);
  return fulfil(route, {
    ok: true,
    url: `${ORIGIN}/${body.kind === 'app' ? 'menu' : (body.url ?? '').slice(ORIGIN.length + 1)}#tgWebAppData=fake`,
    queryId: body.kind === 'menu' ? '55' : null,
    fullsize: false,
    ...(body.username
      ? { bot: { id: '8', name: 'Fake App Bot', username: body.username } }
      : {}),
  });
});
await page.route('**/api/telegram/web-app-prolong', (route) => {
  prolonged += 1;
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/web-app-data', (route) => {
  sentData.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
// The app's own origin: a page that is not this app's, no network.
await page.route(`${ORIGIN}/**`, (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: APP })
);

const box = page.locator('.chat-composer textarea');
const panel = page.locator('[data-web-app]');
const main = page.locator('[data-action="web-app-main"]');
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await box.waitFor({ timeout: 15000 });
};
const appFrame = () => page.frames().find((f) => f.url().startsWith(ORIGIN));
const got = async () =>
  (await appFrame()
    ?.evaluate(() => window.got)
    .catch(() => [])) ?? [];
const gotType = async (type) =>
  (await got()).filter((m) => m.eventType === type);

const menuApp = async () => {
  await page.goto(`${base}/`);
  await open(MENU);
  const button = page.locator('[data-web-app-menu]');
  await button.waitFor({ timeout: 5000 });
  assert((await button.textContent()).includes('Open app'), 'menu text');
  assert((await panel.count()) === 0, 'closed before the click');
  await button.click();
  await panel.waitFor({ timeout: 5000 });
  assert((await panel.getAttribute('data-web-app')) === 'menu', 'a menu app');
  const request = opened[0];
  assert(
    request.kind === 'menu' &&
      request.chat === MENU &&
      request.bot === MENU &&
      request.url === `${ORIGIN}/menu`,
    `request: ${JSON.stringify(request)}`
  );
  assert(
    /^#[0-9a-f]{6}$/.test(request.theme?.bg_color ?? '') &&
      /^#[0-9a-f]{6}$/.test(request.theme?.text_color ?? ''),
    `theme: ${JSON.stringify(request.theme)}`
  );

  // The frame is sandboxed, of the bot's origin, and has no dialogs.
  const frame = page.locator('iframe[data-web-app-frame]');
  await frame.waitFor({ timeout: 5000 });
  const sandbox = await frame.getAttribute('sandbox');
  assert(
    sandbox.includes('allow-scripts') &&
      !sandbox.includes('allow-modals') &&
      !sandbox.includes('allow-top-navigation'),
    `sandbox: ${sandbox}`
  );
  assert((await frame.getAttribute('src')).startsWith(ORIGIN), 'src');
  await panel
    .locator('.web-app-loading')
    .waitFor({ state: 'detached', timeout: 5000 });
  assert(
    (await panel.locator('.web-app-title').textContent()) === 'Fake Bot',
    'title'
  );

  // Ready hides the loader; the MainButton appears with the app's words.
  await main.waitFor({ timeout: 5000 });
  assert((await main.textContent()) === 'Order now', 'main text');
  await until(
    async () => (await page.locator('.web-app-loading').count()) === 0,
    'loader gone'
  );
  // The app asked for the theme and the size and was answered.
  await until(async () => (await gotType('theme_changed')).length > 0, 'theme');
  const viewport = (await gotType('viewport_changed'))[0];
  assert(
    viewport.eventData.width > 100 &&
      viewport.eventData.is_state_stable === true,
    `viewport: ${JSON.stringify(viewport)}`
  );
  const resized = await panel.evaluate((n) => n.getBoundingClientRect().width);
  assert(resized >= 280 && resized <= 400, `width ${resized}`);
  assert(
    (await page.evaluate(
      () =>
        window.getComputedStyle(document.querySelector('[data-web-app]')).resize
    )) === 'both',
    'resizable'
  );
};

const SPOOF = `<!doctype html><meta charset="utf-8"><script>
for (const [t, d] of [
  ['web_app_setup_secondary_button', { is_visible: true, text: 'Spoof' }],
  ['web_app_close', {}],
]) parent.postMessage(JSON.stringify({ eventType: t, eventData: d }), '*');
window.done = true;
</script>`;

const spoofing = async () => {
  // Another frame of the same origin, one of another origin, and the page
  // itself all speak; none of them is the app.
  await page.route('https://other.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: SPOOF })
  );
  await page.route(`${ORIGIN}/spoof`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: SPOOF })
  );
  await page.evaluate((origin) => {
    for (const src of ['https://other.test/', `${origin}/spoof`]) {
      const other = document.createElement('iframe');
      other.src = src;
      other.dataset.spoof = src;
      other.style.display = 'none';
      document.body.append(other);
    }
    for (const [eventType, eventData] of [
      ['web_app_setup_secondary_button', { is_visible: true, text: 'Spoof' }],
      ['web_app_close', {}],
    ]) {
      window.postMessage(JSON.stringify({ eventType, eventData }), '*');
    }
  }, ORIGIN);
  await until(
    async () =>
      page
        .frames()
        .filter(
          (f) => f.url().includes('other.test') || f.url().endsWith('/spoof')
        ).length === 2,
    'spoof frames'
  );
  for (const f of page
    .frames()
    .filter(
      (x) => x.url().includes('other.test') || x.url().endsWith('/spoof')
    )) {
    await until(
      () => f.evaluate(() => window.done === true).catch(() => false),
      'spoof spoke'
    );
  }
  // The app speaks afterwards (when the page tells it to).
  await page.evaluate(() =>
    document
      .querySelector('iframe[data-web-app-frame]')
      .contentWindow.postMessage(JSON.stringify({ eventType: 'ping' }), '*')
  );
  const second = page.locator('[data-action="web-app-secondary"]');
  await second.waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  assert(
    (await second.textContent()) === 'Real',
    'only the app set the button'
  );
  assert((await panel.count()) === 1, 'a spoofed close is ignored');
};

const clicking = async () => {
  // A click on the MainButton reaches the app, which asks for a pop-up.
  await main.click();
  await until(
    async () => (await gotType('main_button_pressed')).length === 1,
    'main pressed'
  );
  const popup = page.locator('[data-web-app-popup]');
  await popup.waitFor({ timeout: 5000 });
  const text = await popup.textContent();
  assert(
    text.includes('Order') && text.includes('Place the order?'),
    `popup: ${text}`
  );
  // Cancel (the app gave no id): popup_closed without a button id.
  await popup.locator('button').nth(1).click();
  await until(
    async () => (await gotType('popup_closed')).length === 1,
    'popup closed'
  );
  assert(
    !('button_id' in (await gotType('popup_closed'))[0].eventData) ||
      (await gotType('popup_closed'))[0].eventData.button_id === '',
    'popup_closed shape'
  );
  await main.click();
  await popup.waitFor({ timeout: 5000 });
  await popup.locator('[data-popup-button="yes"]').click();
  await until(
    async () =>
      (await gotType('popup_closed')).some(
        (m) => m.eventData.button_id === 'yes'
      ),
    'yes answered'
  );
  // The app now wants a back arrow; pressing it reaches the app, which closes.
  const back = page.locator('[data-action="web-app-back"]');
  await back.waitFor({ timeout: 5000 });
  await back.click();
  await panel.waitFor({ state: 'detached', timeout: 5000 });
  assert(prolonged === 0, 'not prolonged within the first seconds');
};

const keyboardApp = async () => {
  await open(KB);
  const key = page.locator('.reply-keyboard .bot-button');
  await key.waitFor({ timeout: 5000 });
  await key.click();
  await panel.waitFor({ timeout: 5000 });
  assert((await panel.getAttribute('data-web-app')) === 'simple', 'simple');
  const request = opened.at(-1);
  assert(
    request.kind === 'simple' &&
      request.bot === KB &&
      request.url === `${ORIGIN}/kb`,
    `request: ${JSON.stringify(request)}`
  );
  await main.waitFor({ timeout: 5000 });
  await main.click();
  // The app's data is recorded by the fake server; the window closes.
  await until(() => sentData.length === 1, 'data sent');
  assert(
    sentData[0].bot === KB &&
      sentData[0].text === 'Pick one' &&
      sentData[0].data === '{"pick":1}',
    `data: ${JSON.stringify(sentData[0])}`
  );
  await panel.waitFor({ state: 'detached', timeout: 5000 });
};

const inlineApp = async () => {
  await open(INL);
  await page.locator('[data-bot-keyboard] [data-bot-button="app"]').click();
  await panel.waitFor({ timeout: 5000 });
  assert((await panel.getAttribute('data-web-app')) === 'inline', 'inline');
  assert(
    opened.at(-1).chat === INL && opened.at(-1).bot === INL,
    'inline request'
  );
  // Close from the ⋯ menu.
  await page.locator('[data-action="web-app-menu"]').click();
  await page.locator('[data-action="web-app-close-item"]').click();
  await panel.waitFor({ state: 'detached', timeout: 5000 });
};

const linkApp = async () => {
  await open(MENU);
  await page.locator('.msg-link').first().click();
  await panel.waitFor({ timeout: 5000 });
  const request = opened.at(-1);
  assert(
    request.kind === 'app' &&
      request.username === 'fake_app_bot' &&
      request.shortName === 'shop' &&
      request.startParam === 'promo',
    `link request: ${JSON.stringify(request)}`
  );
  // The link's username is the title until Telegram's answer names the bot.
  const titleOf = () => panel.locator('.web-app-title').textContent();
  await until(async () => (await titleOf()) === 'Fake App Bot', 'link title');
  // Reload asks again; Escape closes.
  const before = opened.length;
  await page.locator('[data-action="web-app-menu"]').click();
  await page.locator('[data-action="web-app-reload-item"]').click();
  await until(() => opened.length === before + 1, 'reloaded');
  await panel.waitFor({ timeout: 5000 });
  await main.waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'detached', timeout: 5000 });
};

const unavailableApp = async () => {
  await open(MENU);
  await page.route(`${ORIGIN}/menu**`, (route) =>
    route.fulfill({
      status: 521,
      headers: { 'x-frame-options': 'SAMEORIGIN' },
      contentType: 'text/html',
      body: '<!doctype html><title>Unavailable</title>',
    })
  );
  await page.clock.install();
  await page.locator('[data-web-app-menu]').click();
  await panel.locator('iframe').waitFor();
  await page.clock.fastForward(15_100);
  await panel.locator('[data-web-app-failed]').waitFor();
  assert(
    (await panel.locator('.web-app-spinner').count()) === 0,
    'an unavailable app never spins forever'
  );
  assert(
    (
      await panel
        .locator('[data-action="web-app-browser"]')
        .getAttribute('href')
    ).startsWith(ORIGIN),
    'manual browser fallback retains the launch destination'
  );
  await page.unroute(`${ORIGIN}/menu**`);
  await panel.locator('[data-action="web-app-retry"]').click();
  await panel.locator('.web-app-loading').waitFor({ state: 'detached' });
  await panel.locator('[data-action="web-app-close"]').click();
};

await finish(async () => {
  await menuApp();
  await spoofing();
  await clicking();
  await keyboardApp();
  await inlineApp();
  await linkApp();
  await unavailableApp();
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
});
