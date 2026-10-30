// A real chat-menu test creates a visible draft without delivering a message.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
for (const chat of ['111', '222']) {
  for (const [id, sender, body] of [
    [1, 'me', 'Здравствуйте! Вы свободны?'],
    [2, chat, 'Да, слушаю вас'],
  ]) {
    await store.put({
      id: `msg:telegram:${chat}:${id}`,
      source: 'telegram',
      chat,
      chatType: 'personal_chat',
      chatName: `Fixture ${chat}`,
      sender,
      senderName: sender === 'me' ? 'Me' : `Fixture ${chat}`,
      body,
      timestamp: new Date(Date.now() - (3 - id) * 60_000).toISOString(),
      raw: { id },
    });
  }
}
const sent = [];
const { page, base, finish } = await openChatApp('automation-chat', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fixture' };
  },
});
const requests = [];
let fail = false;
await page.route('**/api/automations/run', async (route) => {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 400));
  return fail
    ? fulfil(route, { error: 'fixture planning failure' }, 503)
    : route.continue();
});
page.on('request', (request) => {
  if (request.url().endsWith('/api/automations/run')) {
    requests.push(request.postDataJSON());
  }
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
});

const testButton = () =>
  page.locator(
    '[data-action="chat-automation-test"][data-automation="automation:job-search"]'
  );
const openMenu = async () => {
  await page.locator('[data-action="chat-automations"]').click();
  await testButton().waitFor();
};
const initialTest = async () => {
  await page.goto(`${base}/#chat=telegram:111`);
  await page.locator('.chat-composer').waitFor();
  await openMenu();
  await testButton().click();
  assert(await testButton().isDisabled(), 'busy tests cannot be clicked twice');
  assert(
    (await testButton().getAttribute('aria-busy')) === 'true',
    'preparation is visible'
  );
  await page.locator('.draft-card').waitFor({ timeout: 5000 });
  assert(requests.length === 1, 'test sends one request');
  assert(requests[0].test === true, 'test ignores audience conditions');
  assert(
    JSON.stringify(requests[0].targets) ===
      JSON.stringify([{ source: 'telegram', chat: '111' }]),
    'only the selected conversation is targeted'
  );
  assert(sent.length === 0, 'a safe test does not deliver a message');
  assert(
    (await page.locator('.draft-card').count()) === 1,
    'one visible draft'
  );
  const geometry = await page.locator('.draft-card').evaluate((card) => ({
    bottom: card.getBoundingClientRect().bottom,
    composer: document.querySelector('.chat-composer').getBoundingClientRect()
      .top,
  }));
  assert(
    geometry.bottom < geometry.composer,
    'draft actions are visible above the composer'
  );
};

const closeAndReopen = async () => {
  await page.locator('.draft-card textarea').fill('My unsent edit');
  await page.locator('[data-action="draft-close"]').click();
  await page.locator('.draft-card').waitFor({ state: 'detached' });
  const saved = await store.query((link) =>
    link.id.startsWith('automation-draft:')
  );
  assert(
    saved.length === 1 && saved[0].status === 'pending',
    'close does not skip or send the draft'
  );
  await openMenu();
  await page.keyboard.press('Escape');
  await page.locator('.chat-menu-list').waitFor({ state: 'detached' });
  await openMenu();
  await page.locator('.chat-composer textarea').click();
  await page.locator('.chat-menu-list').waitFor({ state: 'detached' });
  await openMenu();
  await testButton().click();
  await page.locator('.draft-card').waitFor();
  await page.waitForTimeout(250);
  assert(
    (await page.locator('.draft-card').count()) === 1,
    're-test reopens one draft'
  );
  assert(
    (await page.locator('.draft-card textarea').inputValue()) ===
      'My unsent edit',
    'unsent edits survive close and refresh'
  );
  assert(
    (await page.locator('[data-notice="queued"]').count()) === 1,
    're-test reports the available draft rather than nothing'
  );
  assert(sent.length === 0, 'testing and closing never send');
};

const failedAndLateResults = async () => {
  fail = true;
  await openMenu();
  await testButton().click();
  await page.locator('[data-notice="failed"]').waitFor();
  assert(
    (await page.locator('[data-notice="failed"]').textContent()).includes(
      'fixture planning failure'
    ),
    'the owned action reports its actual error'
  );
  fail = false;
  await openMenu();
  await testButton().click();
  await page.locator('[data-chat="telegram:222"]').click();
  await page.locator('[data-row="msg:telegram:222:2"]').waitFor();
  await page.waitForTimeout(600);
  assert(
    (await page.locator('.draft-card').count()) === 0,
    'an old draft never appears in the newly selected conversation'
  );
  assert(sent.length === 0, 'late results never send');
};

await finish(async () => {
  await initialTest();
  await closeAndReopen();
  await failedAndLateResults();
});
