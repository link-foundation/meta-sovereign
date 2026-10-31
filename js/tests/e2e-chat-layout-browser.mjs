// Shared chat geometry and opening unread boundaries, using only fixture data.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const message = (id) => ({
  id: `msg:telegram:555:${id}`,
  source: 'telegram',
  chat: '555',
  chatName: 'Layout fixture',
  chatType: 'personal_chat',
  sender: '555',
  senderName: 'Fixture',
  body: `Message ${id}\n${'A line of fixture text.\n'.repeat(3)}`,
  timestamp: new Date(1700000000000 + id * 1000).toISOString(),
  raw: { id },
});
const read = (maxId, topId = 60) => ({
  id: 'read:telegram:555',
  kind: 'read',
  source: 'telegram',
  chat: '555',
  inboxMaxId: maxId,
  unreadCount: topId - maxId,
  unreadTopId: topId,
});
for (let id = 1; id <= 60; id += 1) {
  await store.put(message(id));
}
await store.put(read(30));
const { page, base, until, finish } = await openChatApp('chat-layout', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
});
const acknowledgements = [];
await page.route('**/api/telegram/read', async (route) => {
  const request = route.request().postDataJSON();
  acknowledgements.push(request);
  await store.put(read(request.maxId, 62));
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/dialog-state', async (route) =>
  fulfil(route, { ok: true, read: await store.get('read:telegram:555') })
);
const lastRow = (id) => page.locator(`[data-row="msg:telegram:555:${id}"]`);
const toBottom = () =>
  page.locator('.chat-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new globalThis.Event('scroll', { bubbles: true }));
  });
const startReading = () =>
  page.locator('.chat-scroll').evaluate((node) => {
    node.scrollTop -= 350;
    node.dispatchEvent(new globalThis.Event('scroll', { bubbles: true }));
    const row = [...node.querySelectorAll('[data-row]')].find(
      (row) =>
        row.getBoundingClientRect().top >= node.getBoundingClientRect().top
    );
    return { id: row.dataset.row, top: row.getBoundingClientRect().top };
  });
const gap = (id) =>
  page.evaluate((id) => {
    const composer = document.querySelector('.chat-composer');
    const bubble = document.querySelector(
      `[data-row="msg:telegram:555:${id}"] .bubble`
    );
    return (
      composer.getBoundingClientRect().top -
      bubble.getBoundingClientRect().bottom
    );
  }, id);
const checkGap = async (id, label) => {
  await until(
    async () => {
      const space = await gap(id);
      return space >= 6 && space <= 12;
    },
    `${label}: last message stays just above composer (gap ${await gap(id)} px)`
  );
};
const replyTo = async (row) => {
  await row.locator('.bubble-body').click({ button: 'right' });
  await page.locator('[role="menu"] [data-action="reply"]').click();
  await page.locator('.composer-reply-bar').waitFor();
};
const clearReply = () => page.locator('.composer-reply-clear').click();

const typingSteps = async (id, label) => {
  const input = page.locator('.chat-composer textarea');
  // A native caret/focus adjustment can leave the live tail within the old
  // 80px threshold, but underneath the composer. Typing must reconcile it.
  await toBottom();
  await page.locator('.chat-scroll').evaluate((node) => {
    node.scrollTop -= 48;
    node.dispatchEvent(new globalThis.Event('scroll', { bubbles: true }));
  });
  await input.click();
  await input.pressSequentially('Typing a reply', { delay: 15 });
  await checkGap(id, `${label} typing`);
  await input.fill('A multiline reply\n'.repeat(12));
  await checkGap(id, `${label} multiline`);
  await input.fill('Short');
  await checkGap(id, `${label} contracted`);
  // Header/status bars resize the viewport without changing bottom reserve.
  await page.locator('.chat-main').evaluate((node) => {
    const bar = document.createElement('div');
    bar.className = 'fixture-header';
    bar.style.cssText = 'height:48px;flex:none';
    node.prepend(bar);
  });
  await checkGap(id, `${label} header expanded`);
  await page.locator('.fixture-header').evaluate((node) => node.remove());
  await checkGap(id, `${label} header removed`);
  await input.fill('');
  await checkGap(id, `${label} cleared`);
  const anchor = await startReading();
  await input.fill('Reading older history\n'.repeat(5));
  await page.waitForTimeout(80);
  const top = await page
    .locator(`[data-row="${anchor.id}"]`)
    .evaluate((node) => node.getBoundingClientRect().top);
  assert(
    Math.abs(top - anchor.top) < 2,
    `${label} typing preserves reader position (${anchor.top} → ${top})`
  );
  await input.fill('');
  await toBottom();
};

const geometrySteps = async () => {
  await page.goto(`${base}/#chat=telegram:555`);
  await lastRow(60).waitFor();
  await page.locator('.chat-unread-line').waitFor();
  await toBottom();
  await checkGap(60, 'Chat');
  const plainHeight = await page
    .locator('.chat-composer')
    .evaluate((node) => node.offsetHeight);
  await replyTo(lastRow(60));
  assert(
    (await page
      .locator('.chat-composer')
      .evaluate((node) => node.offsetHeight)) > plainHeight,
    'reply makes the composer taller'
  );
  await checkGap(60, 'Reply composer');
  await clearReply();
  await checkGap(60, 'Reply cleared');

  // Expanding the composer while reading history must not scroll the reader.
  const anchor = await startReading();
  await replyTo(page.locator(`[data-row="${anchor.id}"]`));
  const top = await page
    .locator(`[data-row="${anchor.id}"]`)
    .evaluate((node) => node.getBoundingClientRect().top);
  assert(
    Math.abs(top - anchor.top) < 2,
    'reply preserves the older-message viewport'
  );
  await clearReply();
  await toBottom();

  await page.evaluate(() => (document.documentElement.style.fontSize = '125%'));
  await checkGap(60, 'Scaled interface');
  await page.evaluate(() =>
    document.documentElement.style.removeProperty('font-size')
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await checkGap(60, 'Phone width');
  await page.setViewportSize({ width: 1200, height: 800 });
  await checkGap(60, 'Desktop restored');
  await typingSteps(60, 'Chat');
};

const dividerSteps = async () => {
  // A partial read keeps the opening separator in place; fully read retires it.
  const openingNext = await page
    .locator('.chat-unread-line')
    .evaluate((node) => node.nextElementSibling.dataset.row);
  await store.put(read(40));
  await until(
    async () =>
      (await page
        .locator('[data-chat="telegram:555"] .chat-item-unread')
        .textContent()) === '20',
    'partial read reaches the UI'
  );
  assert(
    (await page
      .locator('.chat-unread-line')
      .evaluate((node) => node.nextElementSibling.dataset.row)) === openingNext,
    'partial reads do not move the divider'
  );
  const reading = await startReading();
  await store.put(read(60));
  await page.locator('.chat-unread-line').waitFor({ state: 'detached' });
  const keptTop = await page
    .locator(`[data-row="${reading.id}"]`)
    .evaluate((node) => node.getBoundingClientRect().top);
  assert(
    Math.abs(keptTop - reading.top) < 2,
    'retiring a divider above the viewport preserves the visible row'
  );
  await toBottom();
  await checkGap(60, 'Divider retired');
  await store.put(message(61));
  await lastRow(61).waitFor();
  assert(
    (await page.locator('.chat-unread-line').count()) === 0,
    'new live messages cannot resurrect a retired divider'
  );
  await page.reload();
  await lastRow(61).waitFor();
  await page.locator('.chat-unread-line').waitFor();
};

const readAndOperatorSteps = async () => {
  // Ordinary Chat acknowledges visible messages; Operator only acknowledges Done.
  await page.bringToFront();
  await page.evaluate(() => {
    globalThis.localStorage.removeItem('metaSovereignReadReceipts');
    globalThis.dispatchEvent(new globalThis.Event('focus'));
  });
  await until(
    () => acknowledgements.length === 1,
    'ordinary Chat acknowledges the visible unread message'
  );
  await page.locator('.chat-unread-line').waitFor({ state: 'detached' });
  await store.put(read(61, 61));
  await page.reload();
  await lastRow(61).waitFor();
  assert(
    (await page.locator('.chat-unread-line').count()) === 0,
    'opening an already read chat has no divider'
  );
  await store.put(message(62));
  await store.put(read(61, 62));
  await lastRow(62).waitFor();
  assert(
    (await page.locator('.chat-unread-line').count()) === 0,
    'an already read opening cannot create a divider for live arrivals'
  );
  await page.locator('button[data-view="operator"]').click();
  await page.locator('[data-operator-chat="telegram:555"]').waitFor();
  await page.evaluate(() =>
    globalThis.localStorage.removeItem('metaSovereignReadReceipts')
  );
  await lastRow(62).waitFor();
  await toBottom();
  await checkGap(62, 'Operator');
  await typingSteps(62, 'Operator');
  await page.locator('.chat-unread-line').waitFor();
  await page.waitForTimeout(700);
  assert(
    acknowledgements.length === 1,
    'viewing Operator does not acknowledge messages'
  );
  await page.locator('[data-action="operator-done"]').click();
  await until(
    () => acknowledgements.length === 2,
    'Done acknowledges the Operator card'
  );
};

await finish(async () => {
  await geometrySteps();
  await dividerSteps();
  await readAndOperatorSteps();
  console.log(
    '[e2e-chat-layout] compact measured clearance, stable history and accurate unread divider'
  );
});
