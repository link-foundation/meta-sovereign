// A selected reply resumes an older topic; derived facts remain read-only.
import { createMemoryStore } from '../src/storage/universal.js';
import { CONVERSATION_SETTINGS_ID } from '../src/crm/conversation-policy.js';
import { acquaintanceConversation } from './helpers/conversation-fixture.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const messages = acquaintanceConversation().map((message, index) => ({
  ...message,
  chatName: 'Fixture Developer',
  senderName: message.sender === 'me' ? 'Me' : 'Fixture Developer',
  raw: { id: index + 1 },
}));
await store.putMany(messages.slice(0, 7));
await store.put({
  id: 'read:telegram:111',
  source: 'telegram',
  chat: '111',
  kind: 'read',
  inboxMaxId: 0,
  unreadCount: 7,
  unreadTopId: 7,
});
let sent = 0;
const { page, base, finish, until } = await openChatApp(
  'conversation-context',
  {
    store,
    send: async () => {
      sent++;
      return { via: 'fixture' };
    },
  }
);
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
});
await page.route('**/api/telegram/dialog-state', async (route) =>
  fulfil(route, { ok: true, read: await store.get('read:telegram:111') })
);
const asked = [];
page.on('request', (request) => {
  if (request.url().includes('/api/suggest?')) {
    asked.push(new URL(request.url()).searchParams.get('replyTo'));
  }
});
const openChat = async () => {
  await page.goto(`${base}/#chat=telegram:111`);
  await page.locator('.chat-composer').waitFor();
};
const replyToAnswer = async () => {
  await page
    .locator('[data-row="msg:telegram:111:4"] .bubble-body')
    .click({ button: 'right' });
  await page.locator('[role="menu"] [data-action="reply"]').click();
  await page.locator('.composer-reply-bar').waitFor();
};
const openSettings = async () => {
  await page.locator('button[data-view="settings"]').click();
  await page.locator('.conversation-settings').waitFor();
};
const about = async () => {
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('.person-panel').waitFor();
};

await finish(async () => {
  await openChat();
  await replyToAnswer();
  const github = page.locator('.suggestions [data-rule="work.github"]');
  await github.waitFor();
  assert(
    (await github.textContent()) === 'А ты есть на GitHub?',
    'resume the programmer topic'
  );
  await until(
    () => asked.includes('4'),
    'selected reply is included in the server request'
  );
  assert(
    (await github.getAttribute('title')).includes('conversation context'),
    'rule suggestions are not presented as previously used replies'
  );
  await github.click();
  assert(
    (await page.locator('.chat-composer textarea').inputValue()) ===
      'А ты есть на GitHub?',
    'a suggestion only fills the composer'
  );
  await page.locator('.chat-composer textarea').fill('');
  await store.putMany(messages.slice(7));
  await openChat();
  await about();
  await page.locator('.person-context').waitFor();
  assert(
    (await page.locator('.person-context').textContent()).includes(
      'Agreed to be friends'
    ),
    'friendship is retained'
  );
  assert(
    (await page.locator('.person-panel').textContent()).includes('программист'),
    'affirmative profession is learned'
  );
  await page
    .locator('.person-panel a[href="https://github.com/example-developer"]')
    .waitFor();
  await page
    .getByRole('heading', { name: 'What they asked', exact: true })
    .waitFor();
  const thread = page.locator('[data-action="conversation-thread"]').first();
  await thread.click();
  await until(
    () =>
      page.locator('[data-row="msg:telegram:111:8"]').evaluate((row) => {
        const bounds = row.getBoundingClientRect();
        const viewport = globalThis.document
          .querySelector('.chat-scroll')
          .getBoundingClientRect();
        return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
      }),
    'context evidence leads to the actual message'
  );
  await page.locator('.person-panel-head button').click();

  await openSettings();
  for (const key of ['enabled', 'facts', 'questions', 'suggestions']) {
    assert(
      await page.locator(`[data-action="conversation-${key}"]`).isChecked(),
      `${key} defaults on`
    );
  }
  await page.locator('[data-action="conversation-facts"]').uncheck();
  await until(
    async () => (await store.get(CONVERSATION_SETTINGS_ID))?.facts === false,
    'fact setting is persisted'
  );
  await openChat();
  await about();
  assert(
    (await page.getByRole('heading', { name: 'Work', exact: true }).count()) ===
      0,
    'disabled facts are hidden'
  );
  await page
    .getByRole('heading', { name: 'What we asked', exact: true })
    .waitFor();
  await page.locator('.person-panel-head button').click();

  await openSettings();
  await page.locator('[data-action="conversation-enabled"]').uncheck();
  await until(
    async () => (await store.get(CONVERSATION_SETTINGS_ID))?.enabled === false,
    'master switch is persisted'
  );
  await openChat();
  await about();
  await page.locator('.person-learning-disabled').waitFor();
  assert(
    (await page.locator('.suggestions [data-rule]').count()) === 0,
    'disabled rules produce no contextual suggestions'
  );
  await page.locator('.person-panel-head button').click();

  await openSettings();
  await page.locator('[data-action="conversation-enabled"]').check();
  await page.locator('[data-action="conversation-facts"]').check();
  await until(async () => {
    const saved = await store.get(CONVERSATION_SETTINGS_ID);
    return saved?.enabled && saved.facts;
  }, 'learning is restored');
  await page.locator('button[data-view="operator"]').click();
  await page.locator('[data-operator-chat="telegram:111"]').waitFor();
  await replyToAnswer();
  await page
    .locator('.operator-card .suggestions [data-rule="work.projects"]')
    .waitFor();
  assert(sent === 0, 'neither analysis nor suggestions send messages');
  assert(
    (await store.get('read:telegram:111')).unreadCount === 7,
    'analysis does not acknowledge unread messages'
  );
});
