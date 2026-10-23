// Real browser e2e for the reaction tags of Saved Messages (R-Y151), as
// Telegram Desktop has them: in the user's own chat a row of chips above
// the history lists the tags (reaction, name, count); a click filters the
// history to the messages with that reaction (they replace the stream),
// the "×" leaves the filter; a right-click names a tag (up to 12
// characters), which only Premium may do, so without it the chips show a
// lock and the dialog cannot be saved. Telegram's answers faked in the
// page, fake chats in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:saved-tags

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ME = '6';
const OTHER = '5';
const store = createMemoryStore();
const stamp = () => new Date(Date.now() - 60_000).toISOString();
for (const [chat, name, sender] of [
  [ME, 'Saved Messages', 'me'],
  [OTHER, 'Some Friend', '31'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'private',
    sender,
    senderName: 'Someone',
    body: 'plain saved note',
    timestamp: stamp(),
    raw: { id: 1 },
  });
}

const { base, page, until, finish } = await openChatApp('saved-tags', {
  store,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
const infos = {
  [ME]: { kind: 'user', title: 'Saved Messages', self: true },
  [OTHER]: { kind: 'user', title: 'Some Friend' },
};
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, ...infos[chat] });
});

let premium = false;
let tags = [
  { reaction: { emoji: '👍' }, title: 'Work', count: 2 },
  { reaction: { emoji: '🔥' }, title: '', count: 1 },
];
await page.route('**/api/telegram/saved-tags', (route) =>
  fulfil(route, { ok: true, premium, tags })
);
const searches = [];
await page.route('**/api/telegram/saved-tag-search', (route) => {
  searches.push(route.request().postDataJSON());
  return fulfil(route, {
    ok: true,
    more: false,
    messages: [31, 32].map((id) => ({
      id: `msg:telegram:${ME}:${id}`,
      source: 'telegram',
      chat: ME,
      sender: 'me',
      body: `tagged note ${id}`,
      timestamp: stamp(),
      raw: { id },
    })),
  });
});
const renames = [];
await page.route('**/api/telegram/saved-tag-rename', (route) => {
  const body = route.request().postDataJSON();
  renames.push(body);
  tags = tags.map((tag) =>
    tag.reaction.emoji === body.reaction.emoji
      ? { ...tag, title: body.title }
      : tag
  );
  return fulfil(route, { ok: true, title: body.title });
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const chip = (emoji) => page.locator(`[data-saved-tag="${emoji}"]`);
const dialog = page.locator('[data-dialog="saved-tag-rename"]');
const open = (chat) => page.locator(`[data-chat="telegram:${chat}"]`).click();

const filterSteps = async () => {
  await page.goto(`${base}/`);
  await open(OTHER);
  await page.locator('textarea').waitFor({ timeout: 10000 });
  assert(
    (await page.locator('[data-saved-tags]').count()) === 0,
    'no tags row outside Saved Messages'
  );
  await open(ME);
  await chip('👍').waitFor({ timeout: 10000 });
  const first = await chip('👍').textContent();
  assert(first.includes('Work') && first.includes('2'), `chip: ${first}`);
  assert((await chip('🔥').textContent()).includes('1'), 'second chip');
  assert(
    (await page.locator('[data-saved="tag"]').count()) === 0,
    'not filtered yet'
  );

  await chip('👍').click();
  await page.locator('[data-saved="tag"] [data-message]').first().waitFor();
  const shown = await page.locator('[data-saved="tag"]').textContent();
  assert(
    shown.includes('tagged note 31') && shown.includes('tagged note 32'),
    `the found messages: ${shown}`
  );
  assert(
    !shown.includes('plain saved note'),
    'the ordinary history is replaced'
  );
  assert(
    JSON.stringify(searches.at(-1)) ===
      JSON.stringify({ chat: ME, reaction: { emoji: '👍' } }),
    `searched: ${JSON.stringify(searches)}`
  );
  assert(
    (await chip('👍').getAttribute('aria-pressed')) === 'true',
    'the chip is on'
  );

  await page.locator('[data-action="saved-tag-clear"]').click();
  await gone(page.locator('[data-saved="tag"]'), 'the filter ends');
  await page.locator('textarea').waitFor();
  assert(
    (await page.locator('[data-saved-tags]').count()) === 1,
    'the chips stay'
  );
};

const lockedSteps = async () => {
  // Without Premium the chip is locked and the dialog cannot save.
  await chip('🔥').click({ button: 'right' });
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-saved-tag-locked]').waitFor();
  assert(
    await dialog.locator('[data-field="saved-tag-title"]').isDisabled(),
    'the name field is locked'
  );
  assert(
    await dialog.locator('[data-action="saved-tag-save"]').isDisabled(),
    'Save is locked'
  );
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes');
  assert(renames.length === 0, 'nothing sent without Premium');
};

const renameSteps = async () => {
  // With Premium: reopen Saved Messages so the tags load again.
  premium = true;
  await open(OTHER);
  await page.locator('textarea').waitFor();
  await open(ME);
  await chip('🔥').waitFor({ timeout: 10000 });
  await chip('🔥').click({ button: 'right' });
  await dialog.waitFor({ timeout: 5000 });
  const field = dialog.locator('[data-field="saved-tag-title"]');
  assert(await field.isEnabled(), 'the name field is open');
  assert((await field.getAttribute('maxlength')) === '12', 'limited to 12');
  await field.fill('Ideas');
  await dialog.locator('[data-action="saved-tag-save"]').click();
  await gone(dialog, 'closed after Save');
  assert(
    JSON.stringify(renames.at(-1)) ===
      JSON.stringify({ reaction: { emoji: '🔥' }, title: 'Ideas' }),
    `renamed: ${JSON.stringify(renames)}`
  );
  await until(
    async () => (await chip('🔥').textContent()).includes('Ideas'),
    'the new name shows'
  );
};

await finish(async () => {
  await filterSteps();
  await lockedSteps();
  await renameSteps();
});
