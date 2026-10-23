// Real browser e2e for a search across Telegram and a jump to a message
// (R-Y107): what is typed in the chat list's box shows "Global search"
// (a chat Telegram finds, not in the list) and "Messages" found in every
// chat, the words marked; more come as the list is scrolled to its end;
// a found message opens its chat at that message, far back, with nothing
// newer shown above a gap; a found chat opens with its name before any
// message of it is here; a reply's quote opens the chat at the message
// it answers, far back too. A fake chat in a memory store, Telegram's
// answers faked in the page, a server on a free port, a headless
// browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:global-search

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';

const skip = (msg) => {
  console.log(`[e2e-global-search] SKIP: ${msg}`);
  process.exit(0);
};
if (!process.env.RUN_BROWSER_E2E) {
  skip('RUN_BROWSER_E2E not set');
}
const engine = process.env.E2E_BROWSER || 'chromium';
let browserType;
try {
  browserType = (await import('playwright'))[engine];
} catch {
  skip('playwright not installed');
}

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(`assertion failed: ${msg}`);
  }
};

const CHAT = '555';
const COUNT = 600;
const NEEDLE = 20;
const ANSWERED = 15;
const start = Date.now() - COUNT * 3600_000;
const linkOf = (n) => `msg:telegram:${CHAT}:${n}`;
const message = (n) => ({
  id: linkOf(n),
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'personal_chat',
  sender: CHAT,
  senderName: 'Fake Dave',
  body:
    n === NEEDLE
      ? 'here is the Needle you look for'
      : n === COUNT
        ? 'the newest, answering an old one'
        : `message ${n}`,
  timestamp: new Date(start + n * 3600_000).toISOString(),
  ...(n === COUNT ? { replyTo: `${CHAT}:${ANSWERED}` } : {}),
  raw: { id: n },
});
const store = createMemoryStore();
for (let n = 1; n <= COUNT; n += 1) {
  await store.put(message(n));
}

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-global-'));
const handle = await startServer({
  port: 0,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
  automations: {
    scheduler: false,
    setTyping: async () => ({ supported: false }),
    send: async () => ({ via: 'fake' }),
  },
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const fulfil = (route, body) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
await page.route('**/api/telegram/status', (route) =>
  fulfil(route, {
    connected: true,
    kind: 'user',
    account: { username: 'owner' },
    offline: false,
    needsLogin: false,
  })
);
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: true, complete: true, newest: false })
);
const asked = { around: [], peers: [], global: [] };
await page.route('**/api/telegram/history-at', (route) => {
  const body = route.request().postDataJSON();
  asked.around.push(body.id);
  fulfil(route, { ok: true, id: body.id, newest: false });
});
await page.route('**/api/telegram/search-peers', (route) => {
  asked.peers.push(route.request().postDataJSON().q);
  fulfil(route, {
    ok: true,
    peers: [
      {
        chat: CHAT,
        name: 'Fake Dave',
        username: null,
        kind: 'user',
        members: null,
        mine: true,
      },
      {
        chat: '-1009',
        name: 'Fake News',
        username: 'fakenews',
        kind: 'channel',
        members: 1200,
        mine: false,
      },
    ],
  });
});
// The first page: the needle and 29 more; the second: one more.
const found = (n) => {
  const { raw: _raw, ...shown } = message(n);
  return { ...shown, body: `${shown.body} needle` };
};
await page.route('**/api/telegram/search-global', (route) => {
  const body = route.request().postDataJSON();
  asked.global.push(body.cursor ?? null);
  if (body.cursor) {
    return fulfil(route, {
      ok: true,
      messages: [found(5)],
      count: 31,
      more: false,
      cursor: null,
    });
  }
  const first = [message(NEEDLE)].map(({ raw: _raw, ...m }) => m);
  for (let n = 100; first.length < 30; n += 10) {
    first.push(found(n));
  }
  return fulfil(route, {
    ok: true,
    messages: first,
    count: 31,
    more: true,
    cursor: 'c1',
  });
});

const until = async (check, what, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out: ${what}`);
};

// Whether a message's row is drawn and in the stream's view.
const inView = (id) =>
  page.evaluate((target) => {
    const box = document.querySelector('.chat-scroll');
    const row = box?.querySelector(`[data-message="${target}"]`);
    if (!row) {
      return false;
    }
    const a = box.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    return b.bottom > a.top && b.top < a.bottom;
  }, id);
const drawn = (id) =>
  page.locator(`.chat-scroll [data-message="${id}"]`).count();

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();

  // Typed: the chats whose names match, then what Telegram finds; one
  // the list shows is not repeated.
  const global = page.locator('[data-global]');
  await page.locator('.chat-search').fill('fake');
  await global.locator('[data-peer="-1009"]').waitFor({ timeout: 5000 });
  assert(
    (await page
      .locator(`.chat-list [data-chat="telegram:${CHAT}"]`)
      .count()) === 1,
    'the chat whose name matches'
  );
  assert(
    (await global.locator(`[data-peer="${CHAT}"]`).count()) === 0,
    'a listed chat is not repeated'
  );
  await page.locator('.chat-search').fill('needle');
  await until(() => asked.peers.at(-1) === 'needle', 'peers asked');
  const needle = global.locator(`[data-found="${linkOf(NEEDLE)}"]`);
  await needle.waitFor({ timeout: 5000 });
  assert(
    (await needle.locator('mark').first().textContent()) === 'Needle',
    'the word found is marked'
  );
  const headings = await global
    .locator('h3')
    .evaluateAll((list) => list.map((h) => h.textContent));
  assert(
    headings[0] === 'Global search' && headings[1].startsWith('Messages'),
    `sections: ${headings}`
  );

  // Scrolled to the end: the next page.
  await page
    .locator('[data-global-more]')
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await until(() => asked.global.includes('c1'), 'the next page asked');
  await global
    .locator(`[data-found="${linkOf(5)}"]`)
    .waitFor({ timeout: 5000 });

  // A found message far back: its chat opens at it, nothing newer shown.
  await needle.click();
  await until(() => inView(linkOf(NEEDLE)), 'the needle shown', 15_000);
  assert(asked.around.includes(NEEDLE), `around asked: ${asked.around}`);
  assert((await drawn(linkOf(COUNT))) === 0, 'the newest is not drawn');
  await page.locator('[data-action="scroll-new"]').waitFor({ timeout: 5000 });

  // A found chat not in the list opens with its name.
  await global.locator('[data-peer="-1009"]').click();
  await until(
    async () =>
      (await page.locator('.chat-header-title').textContent())?.includes(
        'Fake News'
      ),
    'the found chat opens'
  );

  // A reply's quote far back: the chat opens at the message it answers.
  await page.locator('.chat-search').fill('');
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  // It keeps where it was; "down" goes to the newest.
  await page.locator('[data-action="scroll-new"]').click();
  await until(() => inView(linkOf(COUNT)), 'the newest shown', 15_000);
  await page.locator(`[data-message="${linkOf(COUNT)}"] .bubble-reply`).click();
  await until(() => inView(linkOf(ANSWERED)), 'the answered one', 15_000);
  assert(asked.around.includes(ANSWERED), `around: ${asked.around}`);

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-global-search] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-global-search] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-global-search-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
