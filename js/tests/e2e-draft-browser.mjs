// Real browser e2e for an automation's draft (R-Y85, R-Y86): run from
// the chat header's menu it drafts a message in the chat; the user edits
// it and sends it, and the next chat it fits is offered with the same
// edit, its name in place of the first one's. Fake chats in a
// memory store, a fake sender that only records, a server on a free
// port, a headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:draft

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { buildMessageLink } from '../src/sources/link.js';
import { automationPresets } from '../src/automation/automations.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

// E2E_BROWSER=webkit runs it in Safari's engine.
const { engine, browserType } = await browserOf('draft');

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

// "Say hi to contacts silent for 90 days", saved, without pauses.
const preset = automationPresets().find(
  (a) => a.id === 'automation:reengage-dormant'
);
const HELLO = 'automation:e2e-hello';
const pacing = (ms) => ({ minDelayMs: ms, maxDelayMs: ms, typing: false });

const sent = [];
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-draft-'));
const handle = await startServer({
  localUi: true,
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
      sent.push([draft.chat, draft.text]);
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
const { id: _id, preset: _preset, ...rest } = preset;
await save({ ...rest, id: HELLO, name: 'Hello', pacing: pacing(0) });

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
let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator('[data-chat="vk:201"]').click();
  await page.locator('[data-action="chat-automations"]').click();
  await page
    .locator(`[data-action="chat-automation-run"][data-automation="${HELLO}"]`)
    .click();

  // The draft, in this chat, on "вы" as the chat is.
  const card = page.locator('.draft-card');
  await card.waitFor({ timeout: 15000 });
  assert(
    (await card.getAttribute('data-form')) === 'formal',
    'the formal form'
  );
  const own = await card.locator('textarea').inputValue();
  assert(own.startsWith('Здравствуйте'), `its own text: ${own}`);

  // The user's own words, sent.
  const mine = 'Добрый день, Анна! Есть минутка?';
  await card.locator('textarea').fill(mine);
  await card.locator('[data-action="draft-send"]').click();
  const deadline = Date.now() + 20_000;
  while (sent.length < 1) {
    assert(Date.now() < deadline, 'sent');
    await page.waitForTimeout(100);
  }
  assert(
    sent[0][0] === '201' && sent[0][1] === mine,
    `sent as edited: ${JSON.stringify(sent[0])}`
  );

  // The next chat it fits, with the same edit.
  const bar = page.locator('.next-chat');
  await bar.waitFor({ timeout: 15000 });
  const offer = await bar.innerText();
  assert(/edited/.test(offer), `offered with the edit: ${offer}`);
  await bar.locator('[data-action="next-open"]').click();
  const next = page.locator('.draft-card');
  await page.waitForFunction(
    () =>
      ['vk:202', 'vk:203'].includes(
        document.querySelector('.chat-item.active')?.dataset.chat
      ),
    null,
    { timeout: 15000 }
  );
  await next.waitFor({ timeout: 15000 });
  const text = await next.locator('textarea').inputValue();
  assert(
    /^Добрый день, (Борис|Вера)! Есть минутка\?$/.test(text),
    `the edit, their name: ${text}`
  );
  await next.locator('[data-action="draft-send"]').click();
  while (sent.length < 2) {
    assert(Date.now() < deadline + 20_000, 'the second sent');
    await page.waitForTimeout(100);
  }
  assert(sent[1][1] === text, `sent: ${JSON.stringify(sent[1])}`);
  console.log(`[e2e-draft] sent ${sent.map(([c]) => c).join(' ')}`);

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-draft] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-draft] FAIL (${engine}): ${error.message}`);
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
