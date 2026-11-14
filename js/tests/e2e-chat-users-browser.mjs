// Account-backed scan/preview/apply through the production bundle and default
// Lino wire protocol. No credentials or external provider requests.
import { readFile, rm } from 'node:fs/promises';
import { usersFixture, userOf } from './helpers/chat-users-fakes.mjs';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

let unknown = false;
const fixture = usersFixture({
  participants: [
    userOf(1),
    userOf(2, { firstName: 'Alice', username: 'alice' }),
    userOf(3, { firstName: 'Bob' }),
    userOf(4, { bot: true }),
    userOf(5, { contact: true }),
  ],
  profiles: [userOf(6, { firstName: 'Forwarded author' })],
  messages: [
    {
      id: 9,
      fromId: { className: 'PeerUser', userId: 7n },
      fwdFrom: { fromId: { className: 'PeerUser', userId: 6n } },
      message: '@alice',
      entities: [{ className: 'MessageEntityMention', offset: 0, length: 6 }],
    },
  ],
  invoke: () => (unknown ? {} : { className: 'Updates' }),
});
await fixture.store.put({
  id: 'msg:telegram:-44:9',
  source: 'telegram',
  chat: '-44',
  chatName: 'Study group',
  chatType: 'group',
  body: 'Review our participants',
  sender: '2',
  senderName: 'Alice',
  timestamp: new Date().toISOString(),
  raw: { id: 9 },
});
const { base, page, until, finish } = await openChatApp('chat-users', {
  store: fixture.store,
  telegramAccount: { ...fixture.account, stop: fixture.env.chatUsersStop },
});
await page.route('**/api/telegram/status', (route) =>
  fulfil(route, {
    connected: true,
    kind: 'user',
    available: true,
    account: { username: 'owner' },
    capabilities: { chatUsersStart: true },
  })
);
for (const [name, answer] of Object.entries({
  history: { written: 0, cached: true, complete: true },
  'shared-counts': { ok: true, counts: {} },
  'chat-info*': { kind: 'group', title: 'Study group' },
})) {
  await page.route(`**/api/telegram/${name}`, (route) => fulfil(route, answer));
}
const dialog = page.locator('[data-dialog="chat-users"]');
const button = (name) => dialog.locator(`[data-action="users-${name}"]`);
const field = (name) => dialog.locator(`[data-users-field="${name}"]`);
const scan = async () => {
  await button('start').click();
  await button('preview').waitFor({ timeout: 8000 });
  await until(
    async () => (await dialog.locator('.chat-users-list li').count()) === 7,
    'seven unique users'
  );
};
await finish(async () => {
  await page.goto(base);
  await page.locator('[data-chat="telegram:-44"]').click();
  await page.locator('[data-action="chat-more"]').click();
  await page.locator('[data-action="users-open"]').click();
  await dialog.waitFor({ timeout: 5000 });
  await scan();
  assert(
    !(await field('sharePhone').isChecked()),
    'phone sharing defaults off'
  );
  await button('preview').click();
  await button('apply').waitFor({ timeout: 5000 });
  assert(
    (await button('apply').textContent()).includes('3'),
    'eligible contacts only'
  );
  assert(
    fixture.calls.filter((call) => call.className === 'AddContact').length ===
      0,
    'preview never sends'
  );
  await field('limit').fill('1');
  assert((await button('apply').count()) === 0, 'editing invalidates preview');
  await button('preview').click();
  await button('apply').waitFor({ timeout: 5000 });
  assert(
    (await button('apply').textContent()).includes('1'),
    'limit reflected in explicit apply'
  );
  const downloaded = page.waitForEvent('download');
  await button('download').click();
  const download = await downloaded;
  const file = await download.path();
  const report = JSON.parse(await readFile(file, 'utf8'));
  assert(
    report.users.length === 7 &&
      report.users.find((user) => user.id === '6').sources.includes('forward'),
    'full report preserves provenance'
  );
  await rm(file, { force: true });
  await button('apply').click();
  await until(
    async () => (await dialog.textContent()).includes('Processed 1 of 1'),
    'one contact processed'
  );
  await until(
    async () =>
      (await dialog.locator('.chat-users-list').textContent()).includes(
        'Added'
      ),
    'actual acknowledgement visible'
  );
  const requests = fixture.calls.filter(
    (call) => call.className === 'AddContact'
  );
  assert(
    requests.length === 1 &&
      requests[0].phone === '' &&
      requests[0].addPhonePrivacyException === false,
    'one private no-phone addition'
  );
  unknown = true;
  await scan();
  await field('limit').fill('0');
  await button('preview').click();
  await button('apply').waitFor({ timeout: 5000 });
  await button('apply').click();
  await until(
    async () => (await dialog.textContent()).includes('Outcome unknown'),
    'missing receipt remains unknown'
  );
  assert(
    fixture.calls.filter((call) => call.className === 'AddContact').length ===
      2,
    'unknown stops next contact'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    (await page.evaluate(() => document.documentElement.scrollWidth)) === 390,
    'mobile dialog fits viewport'
  );
  await button('close').scrollIntoViewIfNeeded();
  assert(await button('close').isVisible(), 'mobile close remains reachable');
  await button('close').click();
  assert((await dialog.count()) === 0, 'dialog closes');
});
