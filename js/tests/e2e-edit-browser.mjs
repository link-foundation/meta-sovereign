// Real browser e2e for editing a message in the box (R-Y146), as Telegram
// Desktop does it: Up in an empty box (or Edit in the message's menu)
// opens a bar over the box (pencil, "Edit message", the text on one
// line, ×) and puts the message's text in the box; Enter saves (one
// request: chat message, new text), Esc cancels and the draft typed
// before comes back; unchanged text sends nothing; a text message cannot
// be emptied; a disabled link preview goes with the edit; no dialog
// opens; a message too old is not offered. Fake chats in a memory store,
// the edit request caught in the page, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:edit

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '555';
const OLD_CHAT = '556';
const store = createMemoryStore();
const at = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const own = (chat, id, body, minutes, name) => ({
  id: `msg:telegram:${chat}:${id}`,
  source: 'telegram',
  chat,
  chatName: name,
  chatType: 'user',
  sender: 'me',
  senderName: 'Me',
  outgoing: true,
  body,
  timestamp: at(minutes),
  raw: { id, out: true },
});
await store.put({
  id: `msg:telegram:${CHAT}:1`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Dave',
  body: 'how was it?',
  timestamp: at(10),
  raw: { id: 1 },
});
await store.put(own(CHAT, 2, 'see you at noon', 5, 'Fake Dave'));
await store.put(own(OLD_CHAT, 1, 'a long time ago', 3 * 24 * 60, 'Fake Old'));

const edits = [];
const { base, page, until, finish } = await openChatApp('edit', { store });
await page.route('**/api/message/edit', (route) => {
  edits.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

const box = page.locator('.chat-composer textarea');
const bar = page.locator('[data-edit-bar]');
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await box.waitFor({ timeout: 15000 });
};

// A reload mid-edit: the draft kept on the device is the typed one, not
// the text being edited.
const reloadKeepsDraft = async () => {
  await page
    .locator('.chat-main')
    .getByText('see you at noon')
    .last()
    .click({ button: 'right' });
  await page.locator('[role="menuitem"][data-action="edit"]').click();
  await bar.waitFor({ timeout: 5000 });
  await box.fill('half edited');
  await page.waitForTimeout(1000);
  await page.reload();
  await open(CHAT);
  assert(
    (await box.inputValue()) === 'my draft',
    `draft after reload: ${await box.inputValue()}`
  );
  assert((await bar.count()) === 0, 'not editing after reload');
};

// Too old: no Up, no menu item.
const oldNotEdited = async () => {
  await open(OLD_CHAT);
  await box.click();
  await box.press('ArrowUp');
  await page.waitForTimeout(200);
  assert((await bar.count()) === 0, 'an old message is not edited');
};

await finish(async () => {
  await page.goto(`${base}/`);
  await open(CHAT);

  // Up in the empty box: the bar and the text, the caret at the end.
  await box.click();
  await box.press('ArrowUp');
  await bar.waitFor({ timeout: 5000 });
  const barText = await bar.innerText();
  assert(barText.includes('Edit message'), `bar title: ${barText}`);
  assert(barText.includes('see you at noon'), `bar text: ${barText}`);
  assert(
    (await box.inputValue()) === 'see you at noon',
    `box: ${await box.inputValue()}`
  );
  const caret = await box.evaluate((a) => [a.selectionStart, a.selectionEnd]);
  assert(caret[0] === 15 && caret[1] === 15, `caret: ${caret}`);
  assert(
    (await page.locator('[role="dialog"]').count()) === 0,
    'no edit dialog opens'
  );
  assert(
    (await page.locator('.chat-composer [data-action="voice"]').count()) === 0,
    'no voice button while editing'
  );
  assert(
    (await page.locator('.chat-composer button[data-mode="edit"]').count()) ===
      1,
    'the send button is the check mark'
  );

  // Esc cancels; Up again, no change, Enter: just closes.
  await box.press('Escape');
  await bar.waitFor({ state: 'detached', timeout: 5000 });
  assert((await box.inputValue()) === '', 'box empty after Esc');
  await box.press('ArrowUp');
  await bar.waitFor({ timeout: 5000 });
  await box.press('Enter');
  await bar.waitFor({ state: 'detached', timeout: 5000 });
  assert(edits.length === 0, `unchanged sends nothing: ${edits.length}`);
  assert((await box.inputValue()) === '', 'box empty after closing');

  // From the message's menu, with a draft typed: Esc brings it back.
  await box.fill('my draft');
  await page
    .locator('.chat-main')
    .getByText('see you at noon')
    .last()
    .click({ button: 'right' });
  await page.locator('[role="menuitem"][data-action="edit"]').click();
  await bar.waitFor({ timeout: 5000 });
  assert((await box.inputValue()) === 'see you at noon', 'menu: text');
  await box.press('Escape');
  await bar.waitFor({ state: 'detached', timeout: 5000 });
  assert((await box.inputValue()) === 'my draft', 'the draft came back');

  await reloadKeepsDraft();

  // A text message cannot be emptied: Enter does nothing.
  await box.fill('');
  await box.press('ArrowUp');
  await bar.waitFor({ timeout: 5000 });
  await box.fill('');
  await box.press('Enter');
  await page.waitForTimeout(200);
  assert((await bar.count()) === 1, 'still editing');
  assert(edits.length === 0, 'nothing sent for an empty text');

  // Change it and save: one request, then the box is as before.
  await box.fill('see you at one');
  await box.press('Enter');
  await bar.waitFor({ state: 'detached', timeout: 5000 });
  await until(() => edits.length === 1, 'the edit request');
  assert(edits[0].text === 'see you at one', `text: ${edits[0].text}`);
  assert(
    edits[0].ids[0] === `msg:telegram:${CHAT}:2`,
    `message: ${edits[0].ids}`
  );
  assert(!('noWebpage' in edits[0]), 'no preview field without a link');

  // A link whose preview was dropped goes with the edit.
  await page.route('**/api/telegram/link-preview', (route) =>
    fulfil(route, {
      ok: true,
      state: 'ready',
      preview: { siteName: 'Example', title: 'A page', url: 'https://x.test' },
    })
  );
  await box.press('ArrowUp');
  await bar.waitFor({ timeout: 5000 });
  await box.fill('see https://x.test now');
  await page.locator('.composer-link-preview').waitFor({ timeout: 5000 });
  await page.locator('[data-action="link-preview-close"]').click();
  await box.press('Enter');
  await until(() => edits.length === 2, 'the second edit');
  assert(edits[1].noWebpage === true, `noWebpage: ${JSON.stringify(edits[1])}`);

  await oldNotEdited();
});
