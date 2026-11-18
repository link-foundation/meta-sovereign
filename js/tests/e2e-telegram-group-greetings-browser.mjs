// Production readable-Lino routes and bounded SDK fakes; no live conversations.
import { groupGreetingFixture } from './helpers/group-greeting-fakes.mjs';
import { userOf } from './helpers/chat-users-fakes.mjs';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';

const f = await groupGreetingFixture({
  now: () => Date.UTC(2026, 10, 10, 12),
  participants: [
    userOf(2),
    userOf(3),
    userOf(4),
    userOf(5, { bot: true }),
    userOf(6, { verified: true }),
  ],
});
let kind = 'user';
const { page, base, finish, until } = await openChatApp(
  'telegram-group-greetings',
  {
    store: f.store,
    telegramAccount: {
      ...f.catalog,
      ...f.actions,
      ...f.account,
      stickerPanel: async () => ({ ok: true, recent: [], faved: [], sets: [] }),
      stickerSearch: async () => ({ ok: true, stickers: [], sets: [] }),
      callsList: async () => ({ ok: true, calls: [], next: null }),
      status: async () => ({ connected: true, kind }),
      stop: async () => {
        await f.env.chatUsersStop();
        await f.env.greetingSendStop();
        await f.env.greetingStickersStop();
      },
    },
  }
);
await page.unroute('**/api/telegram/status');
page.setDefaultTimeout(8000);
await page.route('https://vk.com/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1kAAAAASUVORK5CYII=',
      'base64'
    ),
  })
);
const panel = page.locator('[data-telegram-group-greetings]');
const button = (name) =>
  panel.locator(`[data-group-greeting-action="${name}"]`);
const field = (name) => panel.locator(`[data-group-greeting-field="${name}"]`);
const preview = panel.locator('[data-group-greeting-preview]');
const changedJob = async (action, kind, state = 'done') => {
  const progress = panel.locator('[data-group-greeting-job]');
  const old = (await progress.count())
    ? await progress.getAttribute('data-group-greeting-job')
    : null;
  await button(action).click();
  await until(async () => {
    const next = panel.locator(
      `[data-group-greeting-kind="${kind}"][data-group-greeting-progress="${state}"]`
    );
    return (
      (await next.count()) &&
      (await next.getAttribute('data-group-greeting-job')) !== old
    );
  }, `new ${kind} job reaches ${state}`);
};
await finish(async () => {
  await page.goto(`${base}/#/greetings`);
  await page.locator('[data-catalog-panel] > summary').click();
  await panel.locator('summary').click();
  await field('chat').waitFor();
  assert(f.sends().length === 0, 'opening does not send');
  await page.locator('[data-catalog-action="11"]').click();
  await field('chat').fill('@GreetingGroup');
  await field('limit').fill('2');
  await field('delayMs').fill('0');
  const first = await button('scan').boundingBox();
  const second = await button('preview').boundingBox();
  const gap =
    second.y >= first.y + first.height
      ? second.y - first.y - first.height
      : second.x - first.x - first.width;
  assert(
    gap >= 11.5,
    'scan and preview reserve the shared 12-pixel control gap'
  );
  await changedJob('scan', 'scan');
  await until(
    () => button('preview').isEnabled(),
    'completed scan enables preview'
  );
  assert(
    !(await panel.textContent()).includes('Checking visible business profiles'),
    'completed scan stops displaying an active read'
  );
  await button('preview').click();
  await preview.waitFor();
  const text = await preview.textContent();
  assert(
    text.includes('Greeting group (-44)') &&
      text.includes('Person 2 (2)') &&
      text.includes('11'),
    'review exact group, people and frozen sticker'
  );
  assert(
    text.includes('Verified') && text.includes('Bot'),
    'review requested exclusions'
  );
  assert(f.sends().length === 0, 'scan and preview cannot send');
  await field('limit').fill('1');
  assert((await preview.count()) === 0, 'editing invalidates preview');
  await field('limit').fill('2');
  await button('preview').click();
  await preview.waitFor();
  await changedJob('apply', 'greetings');
  await until(async () => f.sends().length === 2, 'confirmed batch');
  assert(
    f.sends().every((r) => r.peer.userId === 2n || r.peer.userId === 3n),
    'greetings are private, never posted into the group'
  );
  assert(
    (await panel.textContent()).includes('Acknowledged'),
    'render acknowledgement counts'
  );
  await changedJob('scan', 'scan');
  await until(() => button('preview').isEnabled(), 'rescan done');
  await button('preview').click();
  await preview.waitFor();
  assert(
    (await preview.textContent()).includes('24 hours'),
    'shared cooldown excludes previous recipients'
  );
  const invoke = f.client.invoke;
  f.client.invoke = async (request) => {
    if (request.className !== 'SendMedia') {
      return invoke(request);
    }
    f.calls.push(request);
    return { updates: [] };
  };
  await changedJob('apply', 'greetings', 'partial');
  assert(f.sends().length === 3, 'missing acknowledgement is never retried');
  assert(
    (await panel.textContent()).includes('Outcome uncertain'),
    'uncertain delivery stays visible'
  );
  kind = 'bot';
  await button('reload').click();
  await until(
    async () => (await field('chat').count()) === 0,
    'unsupported account hides controls'
  );
  kind = 'user';
  await button('reload').click();
  await field('chat').waitFor();
  assert(
    (await field('chat').inputValue()) === '@GreetingGroup',
    'recovery retains draft'
  );
  assert(f.sends().length === 3, 'recovery cannot send');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    'mobile viewport fits'
  );
});
