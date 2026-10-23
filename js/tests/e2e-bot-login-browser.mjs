// Real browser e2e for a bot's login links and attachment-menu bots
// (R-Y201), as Telegram Desktop has them: a login button under a bot's
// message asks Telegram (only when pressed); a default or accepted answer
// opens the address, a request shows "Open this link?" with the domain,
// "Log in to <domain> as <name>" and "Allow <bot> to send me messages" —
// Cancel does nothing, Open accepts and opens the address Telegram gives,
// an unticked login opens the plain link; a link of a login domain asks
// the same way. The paperclip lists the attachment-menu bots that suit the
// chat and opens one's app; a right click removes it; a link with
// startattach asks before adding the bot (terms to agree to), then opens
// its app. Telegram's answers are faked in the page, nothing is ever
// opened for real (window.open is recorded, every other address is
// refused), a memory store, a server on a free port, a headless browser.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:bot-login

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const BOT = '777';
const PERSON = '888';
const ORIGIN = 'https://miniapp.test';
const row = (...buttons) => ({ className: 'KeyboardButtonRow', buttons });
const login = (text, url, buttonId) => ({
  className: 'KeyboardButtonUrlAuth',
  text,
  url,
  buttonId,
});
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
  message(BOT, 'Fake Login Bot', 1, 'Sign in', {
    replyMarkup: {
      className: 'ReplyInlineMarkup',
      rows: [
        row(
          login('Ask', 'https://site.example/ask', 4),
          login('Accepted', 'https://site.example/acc', 5),
          login('Default', 'https://site.example/def', 6)
        ),
      ],
    },
  })
);
await store.put(
  message(BOT, 'Fake Login Bot', 2, 'Or open https://login.example/page now')
);
await store.put(
  message(
    PERSON,
    'Fake Person',
    1,
    'Add https://t.me/new_bot?startattach=go to your menu'
  )
);

const { base, page, until, finish } = await openChatApp('bot-login', {
  store,
});

// Nothing opens for real: window.open is recorded, other origins refused.
await page.addInitScript(() => {
  globalThis.__opened = [];
  globalThis.open = (...args) => {
    globalThis.__opened.push(args);
    return null;
  };
});
await page
  .context()
  .route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.fallback()
      : route.abort()
  );
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = String(route.request().postDataJSON()?.chat ?? '');
  return fulfil(route, {
    chat,
    kind: 'user',
    title: 'Fake',
    ...(chat === BOT ? { bot: true } : {}),
  });
});
await page.route('**/api/telegram/bot-commands', (route) =>
  fulfil(route, { ok: true, commands: [], menu: { kind: 'default' } })
);

// ---- login: what Telegram answers each button, and what the page sent.
const auths = [];
const accepts = [];
await page.route('**/api/telegram/url-auth-domains', (route) =>
  fulfil(route, { ok: true, domains: ['login.example'] })
);
await page.route('**/api/telegram/bot-url-auth', (route) => {
  const body = route.request().postDataJSON();
  auths.push(body);
  if (body.url) {
    return fulfil(route, {
      ok: true,
      status: 'request',
      domain: 'login.example',
      bot: { id: BOT, name: 'Fake Login Bot', username: 'login_bot' },
      requestWriteAccess: false,
    });
  }
  if (body.buttonId === 5) {
    return fulfil(route, {
      ok: true,
      status: 'accepted',
      url: 'https://site.example/acc?token=1',
    });
  }
  if (body.buttonId === 6) {
    return fulfil(route, { ok: true, status: 'default', url: body.original });
  }
  return fulfil(route, {
    ok: true,
    status: 'request',
    domain: 'site.example',
    bot: { id: BOT, name: 'Fake Login Bot', username: 'login_bot' },
    requestWriteAccess: true,
  });
});
await page.route('**/api/telegram/bot-url-accept', (route) => {
  const body = route.request().postDataJSON();
  accepts.push(body);
  return fulfil(route, {
    ok: true,
    status: 'accepted',
    url: `${body.url ?? body.original}?login=1`,
  });
});

// ---- attachment menu.
let installed = [
  { id: '9', name: 'Notes', shortName: 'Notes', peerTypes: ['pm'] },
  { id: '10', name: 'Groups', shortName: 'Groups', peerTypes: ['chat'] },
];
const toggles = [];
const webApps = [];
await page.route('**/api/telegram/attach-menu-bots', (route) =>
  fulfil(route, {
    ok: true,
    bots: installed.map((b) => ({ ...b, inactive: false })),
  })
);
await page.route('**/api/telegram/attach-menu-bot', (route) =>
  fulfil(route, {
    ok: true,
    bot: {
      id: '11',
      name: 'New Bot',
      shortName: 'New',
      username: 'new_bot',
      peerTypes: ['pm'],
      inactive: true,
      requestWriteAccess: true,
    },
  })
);
await page.route('**/api/telegram/attach-menu-toggle', (route) => {
  const body = route.request().postDataJSON();
  toggles.push(body);
  if (body.enabled === false) {
    installed = installed.filter((b) => b.id !== body.bot);
  }
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/web-app-open', (route) => {
  webApps.push(route.request().postDataJSON());
  return fulfil(route, {
    ok: true,
    url: `${ORIGIN}/app#tgWebAppData=fake`,
    queryId: '5',
    fullsize: false,
  });
});
await page.route(`${ORIGIN}/**`, (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><p>fake app</p>',
  })
);

const box = page.locator('.chat-composer textarea');
const dialog = page.locator('[data-bot-dialog]');
const opened = () => page.evaluate(() => globalThis.__opened.map((a) => a[0]));
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await box.waitFor({ timeout: 15000 });
};
const pressLogin = async (text) => {
  await page.locator('[data-bot-button="login"]', { hasText: text }).click();
};

const loginButtons = async () => {
  await page.goto(`${base}/`);
  await open(BOT);
  await page.locator('[data-bot-button="login"]').first().waitFor();
  assert(auths.length === 0, 'nothing is asked before a press');
  assert(
    (await page.locator('[data-bot-button="login"]').count()) === 3,
    'three login buttons'
  );

  // A request: the box shows the domain and both choices; Cancel is a no-op.
  await pressLogin('Ask');
  await dialog.waitFor();
  assert((await dialog.getAttribute('data-bot-dialog')) === 'login', 'box');
  assert(
    (await dialog.locator('[data-login-domain]').textContent()) ===
      'site.example',
    'the domain'
  );
  assert(
    auths.length === 1 &&
      auths[0].chat === BOT &&
      auths[0].id === 1 &&
      auths[0].buttonId === 4,
    `asked: ${JSON.stringify(auths)}`
  );
  const loginBox = dialog.locator('[data-field="login"]');
  const writeBox = dialog.locator('[data-field="write"]');
  assert(await loginBox.isChecked(), 'login ticked');
  assert(await writeBox.isChecked(), 'write ticked');
  assert(
    (await dialog.locator('.bot-login-check').first().textContent()).includes(
      'site.example'
    ),
    'login words name the domain'
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert(accepts.length === 0 && (await opened()).length === 0, 'cancel');

  // Open with both ticked: accepted with write_allowed, the new address.
  await pressLogin('Ask');
  await dialog.waitFor();
  await page.click('[data-action="login-open"]');
  await until(async () => (await opened()).length === 1, 'opened');
  assert(
    accepts.length === 1 &&
      accepts[0].writeAllowed === true &&
      accepts[0].buttonId === 4,
    `accept: ${JSON.stringify(accepts)}`
  );
  assert(
    (await opened())[0] === 'https://site.example/ask?login=1',
    `opened ${(await opened())[0]}`
  );

  // Write unticked: accepted without it.
  await pressLogin('Ask');
  await dialog.waitFor();
  await writeBox.uncheck();
  await page.click('[data-action="login-open"]');
  await until(async () => accepts.length === 2, 'second accept');
  assert(accepts[1].writeAllowed === false, 'write not allowed');
  await until(async () => (await opened()).length === 2, 'opened again');

  // Login unticked: the plain link, nothing accepted, write disabled.
  await pressLogin('Ask');
  await dialog.waitFor();
  await loginBox.uncheck();
  assert(await writeBox.isDisabled(), 'write disabled without login');
  await page.click('[data-action="login-open"]');
  await until(async () => (await opened()).length === 3, 'plain opened');
  assert(accepts.length === 2, 'no accept without login');
  assert((await opened())[2] === 'https://site.example/ask', 'the plain link');

  // Accepted and default answers open at once, without a box.
  await pressLogin('Accepted');
  await until(async () => (await opened()).length === 4, 'accepted opens');
  assert(
    (await opened())[3] === 'https://site.example/acc?token=1',
    'accepted address'
  );
  await pressLogin('Default');
  await until(async () => (await opened()).length === 5, 'default opens');
  assert((await opened())[4] === 'https://site.example/def', 'default address');
  assert((await dialog.count()) === 0, 'no box for those');
};

const loginLink = async () => {
  const before = auths.length;
  await page.locator('a.msg-link', { hasText: 'login.example' }).click();
  await dialog.waitFor();
  assert(
    auths.length === before + 1 &&
      auths[before].url === 'https://login.example/page',
    `link asked: ${JSON.stringify(auths.at(-1))}`
  );
  assert(
    (await dialog.locator('[data-field="write"]').count()) === 0,
    'no write'
  );
  await page.click('[data-action="login-open"]');
  await until(async () => (await opened()).length === 6, 'link opened');
  assert(
    (await opened())[5] === 'https://login.example/page?login=1',
    'link address'
  );
  assert((await page.locator('.web-app').count()) === 0, 'no tab of its own');
};

const attachMenu = async () => {
  await open(PERSON);
  await page.click('[data-action="attach"]');
  await page.waitForSelector('[data-action="attach-bot-9"]');
  assert(
    (await page.locator('[data-action="attach-bot-10"]').count()) === 0,
    'a group-only bot is not offered in a private chat'
  );
  await page.click('[data-action="attach-bot-9"]');
  await page.locator('[data-web-app]').waitFor({ timeout: 5000 });
  assert(
    webApps.length === 1 &&
      webApps[0].kind === 'attach' &&
      webApps[0].chat === PERSON &&
      webApps[0].bot === '9' &&
      webApps[0].url === undefined,
    `web app: ${JSON.stringify(webApps)}`
  );
  await page.locator('[data-action="web-app-close"]').click();
  await page.locator('[data-web-app]').waitFor({ state: 'detached' });

  // A right click offers Remove from menu.
  await page.click('[data-action="attach"]');
  await page.locator('[data-action="attach-bot-9"]').click({ button: 'right' });
  await page.click('[data-action="attach-bot-remove"]');
  await until(async () => toggles.length === 1, 'removed');
  assert(
    toggles[0].bot === '9' && toggles[0].enabled === false,
    `remove: ${JSON.stringify(toggles[0])}`
  );
  await page.click('[data-action="attach"]');
  await page.waitForSelector('[data-action="attach-file"]');
  assert(
    (await page.locator('[data-action="attach-bot-9"]').count()) === 0,
    'the removed bot is gone from the menu'
  );
  await page.keyboard.press('Escape');
};

const addBot = async () => {
  await page.locator('a.msg-link', { hasText: 'startattach' }).click();
  await dialog.waitFor();
  assert((await dialog.getAttribute('data-bot-dialog')) === 'attach', 'box');
  const add = page.locator('[data-action="attach-bot-add"]');
  assert(await add.isDisabled(), 'Add waits for the terms');
  assert(toggles.length === 1, 'nothing added before the press');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert(toggles.length === 1, 'Cancel adds nothing');

  await page.locator('a.msg-link', { hasText: 'startattach' }).click();
  await dialog.waitFor();
  await dialog.locator('[data-field="terms"]').check();
  assert(!(await add.isDisabled()), 'Add after the terms');
  await add.click();
  await until(async () => toggles.length === 2, 'added');
  assert(
    toggles[1].bot === '11' &&
      toggles[1].enabled === true &&
      toggles[1].writeAllowed === true,
    `add: ${JSON.stringify(toggles[1])}`
  );
  // The link's start parameter goes to the app that now opens.
  await page.locator('[data-web-app]').waitFor({ timeout: 5000 });
  assert(
    webApps.length === 2 &&
      webApps[1].kind === 'attach' &&
      webApps[1].bot === '11' &&
      webApps[1].startParam === 'go',
    `second app: ${JSON.stringify(webApps[1])}`
  );
};

await finish(async () => {
  await loginButtons();
  console.log('[e2e-bot-login] login buttons: request, accept, plain, default');
  await loginLink();
  console.log('[e2e-bot-login] a login-domain link asks the same way');
  await attachMenu();
  console.log('[e2e-bot-login] attachment menu: list, open, remove');
  await addBot();
  console.log('[e2e-bot-login] startattach: asks, terms, adds, opens');
});
