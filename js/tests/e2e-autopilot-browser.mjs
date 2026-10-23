// Real browser e2e for the autopilot (R-Y87, R-Y91): started from the
// Automations page it opens the chats as it writes to them; the chat
// header's Automations menu starts and stops it too. Fake chats in a
// memory store, a fake sender that only records, a server on a free
// port, a headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:autopilot

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { buildMessageLink } from '../src/sources/link.js';
import { automationPresets } from '../src/automation/automations.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

// E2E_BROWSER=webkit runs it in Safari's engine.
const { engine, browserType } = await browserOf('autopilot');

const DAY = 86_400_000;
const store = createMemoryStore();
let seq = 0;
const say = (chat, sender, senderName, body, daysAgo) =>
  store.put(
    buildMessageLink({
      source: 'vk',
      externalId: String((seq += 1)),
      sender,
      senderName,
      chatName: senderName === 'me' ? undefined : senderName,
      chat,
      body,
      timestamp: new Date(Date.now() - daysAgo * DAY).toISOString(),
    })
  );
// Three people not written to for long, all on "вы".
const people = [
  ['201', 'anna', 'Анна Петрова', 120],
  ['202', 'boris', 'Борис Иванов', 200],
  ['203', 'vera', 'Вера Смирнова', 300],
];
for (const [chat, id, name, ago] of people) {
  await say(chat, 'me', 'me', 'Здравствуйте! Вы свободны?', ago);
  await say(chat, id, name, 'Да, слушаю вас', ago);
}

// Two copies of "say hi to contacts silent for 90 days": one quick, one
// that waits a minute between chats (to be stopped from the menu).
const preset = automationPresets().find(
  (a) => a.id === 'automation:reengage-dormant'
);
const QUICK = 'automation:e2e-quick';
const SLOW = 'automation:e2e-slow';
const pacing = (ms) => ({ minDelayMs: ms, maxDelayMs: ms, typing: false });

const sent = [];
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-autopilot-'));
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
    send: async (draft) => {
      sent.push(draft.chat);
      return { via: 'fake' };
    },
  },
});
const base = `http://127.0.0.1:${handle.port}`;
const save = async (automation) => {
  const res = await fetch(`${base}/api/automations`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ automation }),
  });
  assert(res.ok, `saved ${automation.id}: ${res.status}`);
};
// Quiet hours (R-Z3) are on by default: the test runs at any hour.
await fetch(`${base}/api/automations/settings`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ quietHours: { enabled: false } }),
});
const { id: _id, preset: _preset, ...rest } = preset;
await save({ ...rest, id: QUICK, name: 'Quick hello', pacing: pacing(1500) });
await save({ ...rest, id: SLOW, name: 'Slow hello', pacing: pacing(60_000) });

const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const confirms = [];
page.on('dialog', (dialog) => {
  confirms.push(dialog.message());
  dialog.accept();
});
const go = (view) =>
  page.evaluate((v) => {
    globalThis.dispatchEvent(
      new globalThis.CustomEvent('meta-sovereign:navigate', {
        detail: { view: v },
      })
    );
  }, view);
const autopilotState = async (id) => {
  const res = await fetch(`${base}/api/automations/autopilot`);
  const { autopilots } = await res.json();
  return autopilots.find((a) => a.automation === id) ?? null;
};

let failed = false;
try {
  await page.goto(`${base}/`);
  // The header menu starts one and stops it after its first chat.
  await page.locator('[data-chat="vk:201"]').click();
  const menu = async () => {
    const toggle = page.locator('[data-action="chat-automations"]');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await page.waitForSelector('.chat-menu-list', { timeout: 5000 });
  };
  await menu();
  await page
    .locator(`[data-action="autopilot-start"][data-automation="${SLOW}"]`)
    .click();
  const deadlineOn = Date.now() + 15_000;
  while ((await autopilotState(SLOW))?.status !== 'waiting') {
    assert(Date.now() < deadlineOn, 'the slow one is waiting');
    await page.waitForTimeout(150);
  }
  await menu();
  const stop = page.locator(
    `[data-action="autopilot-stop"][data-automation="${SLOW}"]`
  );
  await stop.waitFor({ timeout: 10000 });
  await stop.click();
  const deadlineOff = Date.now() + 10_000;
  while ((await autopilotState(SLOW))?.on !== false) {
    assert(Date.now() < deadlineOff, 'stopped from the menu');
    await page.waitForTimeout(150);
  }
  assert(
    (await autopilotState(SLOW)).status === 'stopped',
    'its state says stopped'
  );
  assert(sent.length === 1, `one chat before it was stopped: ${sent}`);
  confirms.length = 0;
  console.log('[e2e-autopilot] menu: started, then stopped');

  // From the Automations page: the two chats left.
  const before = sent.length;
  await go('automation');
  const row = page.locator('li', {
    has: page.locator(`[data-automation="${QUICK}"]`),
  });
  await row.locator('[data-action="autopilot-start"]').click();

  // Confirmed, it goes to the chats and opens each as it writes to it.
  await page.waitForSelector('.autopilot-bar', { timeout: 15000 });
  assert(confirms.length === 1, `asked once: ${confirms.length}`);
  const opened = new Set();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const active = await page
      .locator('.chat-item.active')
      .getAttribute('data-chat')
      .catch(() => null);
    if (active) {
      opened.add(active);
    }
    if ((await autopilotState(QUICK))?.status === 'done') {
      break;
    }
    await page.waitForTimeout(150);
  }
  const done = await autopilotState(QUICK);
  assert(done?.status === 'done', `done: ${JSON.stringify(done)}`);
  assert(
    sent.length === before + 2 && [...sent].sort().join() === '201,202,203',
    `wrote to every chat once: ${sent}`
  );
  assert(
    sent.slice(before).every((chat) => opened.has(`vk:${chat}`)),
    `opened the chats it wrote to: ${[...opened]}`
  );
  await page.waitForSelector('.autopilot-bar[data-autopilot="done"]', {
    timeout: 10000,
  });
  console.log(
    `[e2e-autopilot] page: sent ${sent.length}, opened ${[...opened].join(' ')}`
  );

  // Back on the page its row says it is done; Dismiss clears it.
  await go('automation');
  const close = row.locator('[data-action="autopilot-close"]');
  await close.waitFor({ timeout: 10000 });
  await close.click();
  await row.locator('[data-action="autopilot-start"]').waitFor();

  // Send safety (R-Z3): the send log lists what went out, an unknown
  // send waits for the user's word, and the opt-out list is editable.
  await store.put({
    id: 'outbox:e2e:vk:999:abc:2026-10-01',
    tokens: ['outbox', 'automation', 'vk'],
    kind: 'automation',
    key: 'e2e:vk:999:abc:2026-10-01',
    owner: 'automation:e2e',
    source: 'vk',
    chat: '999',
    text: 'maybe sent',
    status: 'unknown',
    at: new Date().toISOString(),
  });
  await page.reload();
  await page.locator('button[data-view="automation"]').click();
  const panel = page.locator('[data-panel="safety"]');
  await panel
    .locator('[data-outbox="sent"]')
    .first()
    .waitFor({ timeout: 10000 });
  const sentRows = await panel.locator('[data-outbox="sent"]').count();
  assert(sentRows >= 3, `the send log lists the sends: ${sentRows}`);
  const unknownRow = panel.locator('[data-outbox="unknown"]');
  await unknownRow.waitFor({ timeout: 10000 });
  await unknownRow.locator('[data-action="outbox-failed"]').click();
  await panel
    .locator('[data-outbox="unknown"]')
    .waitFor({ state: 'detached', timeout: 10000 });
  assert(
    (await store.get('outbox:e2e:vk:999:abc:2026-10-01')).status === 'failed',
    'the user settled it as not arrived'
  );
  await panel.locator('[data-field="optout-source"]').fill('vk');
  await panel.locator('[data-field="optout-chat"]').fill('777');
  await panel.locator('[data-action="optout-add"]').click();
  await panel.locator('[data-optout="vk:777"]').waitFor({ timeout: 10000 });
  const saved = await (await fetch(`${base}/api/automations/settings`)).json();
  assert(
    saved.optOut.some((e) => e.chat === '777') &&
      saved.quietHours.enabled === false,
    `the opt-out list is saved: ${JSON.stringify(saved)}`
  );
  await panel
    .locator('[data-optout="vk:777"] [data-action="optout-remove"]')
    .click();
  await panel
    .locator('[data-optout="vk:777"]')
    .waitFor({ state: 'detached', timeout: 10000 });
  console.log('[e2e-autopilot] send safety: log, unknown, opt-out');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-autopilot] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-autopilot] FAIL (${engine}): ${error.message}`);
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
