// Production readable-Lino routes and SDK-shaped fakes. No live conversations.
import { greetingSendFixture } from './helpers/greeting-send-fakes.mjs';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';

const fixture = await greetingSendFixture({
  now: () => Date.UTC(2026, 10, 10, 12),
});
let kind = 'user';
const { page, base, finish, until } = await openChatApp(
  'telegram-greeting-send',
  {
    store: fixture.store,
    telegramAccount: {
      ...fixture.catalog,
      ...fixture.actions,
      stickerPanel: async () => ({ ok: true, recent: [], faved: [], sets: [] }),
      stickerSearch: async () => ({ ok: true, stickers: [], sets: [] }),
      callsList: async () => ({ ok: true, calls: [], next: null }),
      status: async () => ({ connected: true, kind }),
      stop: async () => {
        await fixture.env.greetingSendStop();
        await fixture.env.greetingStickersStop();
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
const panel = page.locator('[data-telegram-greeting-send]');
const button = (name) => panel.locator(`[data-greeting-send-action="${name}"]`);
const field = (name) => panel.locator(`[data-greeting-send-field="${name}"]`);
await finish(async () => {
  await page.goto(`${base}/#/greetings`);
  await page.locator('[data-catalog-panel] > summary').click();
  await field('chat').waitFor();
  assert(fixture.sends().length === 0, 'opening cannot send');
  await panel.locator('[data-catalog-action="11"]').click();
  await field('chat').fill('@GreetingGroup');
  await button('preview').click();
  const preview = panel.locator('[data-greeting-send-preview]');
  await preview.waitFor();
  assert(
    (await preview.textContent()).includes('Greeting group (-44)'),
    'preview names the resolved typed target'
  );
  assert(
    (await preview.textContent()).includes('11'),
    'preview names the exact sticker'
  );
  assert(fixture.sends().length === 0, 'preview cannot send');
  await button('send').click();
  await panel.locator('[data-greeting-send-result="sent"]').waitFor();
  assert(fixture.sends().length === 1, 'one explicit send');
  assert(
    fixture.sends()[0].peer.chatId === 44n,
    'the group target is retained'
  );
  assert(
    (await button('send').count()) === 0,
    'used preview cannot be clicked again'
  );
  await button('preview').click();
  await preview.waitFor();
  assert(
    await button('send').isDisabled(),
    'rolling 24-hour deduplication disables sending'
  );
  await field('operation').selectOption('bot-start');
  await field('chat').fill('@GreetingUser');
  await button('preview').click();
  await until(
    async () =>
      (await panel.locator('[role="alert"]').textContent()).includes('bot'),
    'a person cannot receive the bot-start operation'
  );
  assert(
    (await field('chat').inputValue()) === '@GreetingUser',
    'failed preview retains the draft'
  );
  await field('chat').fill('@GreetingBot');
  await button('preview').click();
  await preview.waitFor();
  assert(
    (await preview.textContent()).includes('/start'),
    'review exact bot command'
  );
  await button('send').click();
  await panel.locator('[data-greeting-send-result="sent"]').waitFor();
  assert(
    fixture.sends().length === 2 && fixture.sends()[1].message === '/start',
    'confirmed bot command'
  );
  await field('operation').selectOption('greeting-sticker');
  await field('chat').fill('@GreetingUser');
  fixture.client.invoke = async (request) => {
    fixture.calls.push(request);
    return { updates: [] };
  };
  await button('preview').click();
  await preview.waitFor();
  await button('send').click();
  await panel.locator('[data-greeting-send-result="unknown"]').waitFor();
  assert(fixture.sends().length === 3, 'uncertain send is not retried');
  await button('preview').click();
  await preview.waitFor();
  assert(
    await button('send').isDisabled(),
    'fresh previews cannot bypass an uncertain outcome'
  );
  kind = 'bot';
  await button('reload').click();
  await until(
    async () => (await field('chat').count()) === 0,
    'unsupported kind hides send controls'
  );
  kind = 'user';
  await button('reload').click();
  await field('chat').waitFor();
  assert(
    (await field('chat').inputValue()) === '@GreetingUser',
    'capability recovery retains the draft'
  );
  assert(fixture.sends().length === 3, 'capability recovery never sends');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    'mobile controls fit the viewport'
  );
});
