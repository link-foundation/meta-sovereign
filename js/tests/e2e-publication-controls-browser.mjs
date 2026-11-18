// Production UI and confirmation routes with isolated offline providers.
import { createMemoryStore } from '../src/storage/universal.js';
import { saveTarget } from '../src/broadcast/targets.js';
import { saveBroadcastCredentials } from '../src/broadcast/credentials.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import { requestBody } from './helpers/http-wire.mjs';

const store = createMemoryStore();
await saveBroadcastCredentials(store, 'telegram', {
  botToken: 'fixture-secret-never-rendered',
});
await saveTarget(store, {
  id: 'news',
  label: 'News channel',
  network: 'telegram',
  kind: 'channel',
  destination: '@fixture_news',
  format: 'html',
});
const calls = [];
let uncertain = false;
const resolveSource = () => ({
  live: {
    publishPost: async (content) => {
      calls.push({ operation: 'publish', content });
      if (uncertain) {
        throw Object.assign(new Error('Fixture response lost'), {
          ambiguous: true,
        });
      }
      return { messageId: '81', chat: content.chat };
    },
    deletePost: async (receipt) => {
      calls.push({ operation: 'delete', receipt });
      return { deleted: true };
    },
    testConnection: async () => {
      calls.push({ operation: 'test' });
      return { ok: true, verified: true, permissionsVerified: false };
    },
  },
});
const { page, base, until, finish } = await openChatApp(
  'publication-controls',
  {
    store,
    serverOptions: { broadcasting: { resolveSource } },
    acceptDialog: (dialog) =>
      dialog.type() === 'confirm' &&
      [
        'Delete the recorded post from News channel? This changes the provider destination.',
        'Have you checked the original destinations? Starting a new publication uses a new request ID and may repeat a message that already arrived.',
      ].includes(dialog.message()),
  }
);
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  globalThis.localStorage.setItem(
    'metaSovereignTutorial',
    JSON.stringify({ v: 5, off: true })
  );
});
const panel = page.locator('[data-publication-panel]');
const tab = (name) => panel.getByRole('tab', { name, exact: true });
const publish = () =>
  panel.getByRole('button', { name: 'Publish reviewed message', exact: true });
const preview = () =>
  panel.getByRole('button', { name: 'Preview', exact: true });
const notice = () => panel.locator('[data-publication-notice]');

const editDestinations = async () => {
  await tab('Destinations & credentials').click();
  await panel.getByLabel('Destination ID', { exact: true }).fill('team');
  await panel
    .getByLabel('Destination name', { exact: true })
    .fill('Team group');
  await panel
    .getByLabel('Destination type', { exact: true })
    .selectOption('group');
  await panel
    .getByLabel('Telegram chat ID / @username or VK wall ID', { exact: true })
    .fill('-100321');
  await panel
    .locator('form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await until(
    async () => (await notice().textContent()) === 'Destination saved.',
    'destination saved'
  );
  assert(
    (await store.get('broadcast-target:team')).kind === 'group',
    'destination persisted'
  );
  const credentialFields = panel.locator('.publication-credentials');
  const secret = credentialFields.getByLabel('Telegram bot token', {
    exact: true,
  });
  assert(
    (await secret.inputValue()) === '',
    'saved credential values are never read back'
  );
  await secret.fill('replacement-fixture-secret');
  await credentialFields
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await until(
    async () =>
      (await notice().textContent()) ===
      'Credential settings saved. Values are not returned.',
    'credential saved'
  );
  assert(
    (await secret.inputValue()) === '',
    'entered secret clears after saving'
  );
  assert(
    (await store.get('secret:telegram:bot-token')).value ===
      'replacement-fixture-secret',
    'credential persisted locally'
  );
  await panel.getByLabel('Network', { exact: true }).selectOption('vk');
  await panel
    .getByLabel('Destination type', { exact: true })
    .selectOption('community-wall');
  await panel
    .getByLabel('Authentication mode', { exact: true })
    .selectOption('community');
  await panel.getByLabel('Network', { exact: true }).selectOption('x');
  await panel
    .getByLabel('Authentication mode', { exact: true })
    .selectOption('app-only');
  await tab('Compose').click();
};

await finish(async () => {
  await page.goto(`${base}/#broadcast`);
  await panel.getByLabel(/News channel/).check();
  await panel
    .getByLabel('Publication text', { exact: true })
    .fill('<b>Fixture news</b>');
  assert(
    await publish().isDisabled(),
    'publication requires an explicit preview'
  );
  await panel
    .getByRole('button', { name: 'Test identity', exact: true })
    .click();
  await until(
    async () => (await notice().textContent())?.includes('Identity verified'),
    'read-only identity result'
  );
  assert(
    calls.length === 1 && calls[0].operation === 'test',
    'testing never publishes'
  );
  await preview().click();
  await panel.locator('[data-publication-preview]').waitFor();
  assert(
    (await panel.locator('[data-publication-preview]').textContent()).includes(
      '@fixture_news'
    ),
    'preview contains actual destination'
  );
  assert(
    !(await panel.textContent()).includes('fixture-secret-never-rendered'),
    'secret is never rendered'
  );
  await publish().click();
  await until(
    async () => (await notice().textContent()) === 'Sent.',
    'confirmed publication'
  );
  assert(
    calls.filter((call) => call.operation === 'publish').length === 1,
    'published once'
  );
  await tab('Published posts').click();
  await panel.getByText('@fixture_news / 81', { exact: true }).waitFor();
  await panel
    .getByRole('button', { name: 'Delete published post', exact: true })
    .click();
  await until(
    async () =>
      (
        await panel.locator('[data-publication-history]').textContent()
      ).includes('Deletion confirmed.'),
    'deletion acknowledged'
  );
  assert(
    calls.filter((call) => call.operation === 'delete').length === 1,
    'deletion once'
  );

  await editDestinations();
  await panel
    .getByRole('button', { name: 'New publication', exact: true })
    .click();
  uncertain = true;
  await preview().click();
  await panel.locator('[data-publication-preview]').waitFor();
  await publish().click();
  await until(
    async () =>
      (await notice().textContent())?.includes('Delivery is uncertain'),
    'unknown publication'
  );
  assert(await publish().isDisabled(), 'unknown result blocks another send');
  const attempted = calls.filter((call) => call.operation === 'publish').length;
  await page.reload();
  await panel.getByText(/Delivery is uncertain or still running/).waitFor();
  assert(await preview().isDisabled(), 'pending request survives reload');
  assert(
    (await panel
      .getByLabel('Publication text', { exact: true })
      .inputValue()) === '<b>Fixture news</b>',
    'draft survives reload'
  );
  assert(
    calls.filter((call) => call.operation === 'publish').length === attempted,
    'reload never replays an unknown publication'
  );

  await panel
    .getByRole('button', { name: 'New publication', exact: true })
    .click();
  await preview().click();
  await panel.locator('[data-publication-preview]').waitFor();
  let interrupted = 0;
  await page.route('**/api/broadcast/publish', (route) => {
    if (requestBody(route.request()).confirmToken) {
      interrupted++;
      return route.abort('failed');
    }
    return route.continue();
  });
  await publish().click();
  await until(
    async () =>
      (await notice().textContent())?.includes('Delivery is uncertain'),
    'lost API response stays uncertain'
  );
  assert(interrupted === 1, 'interrupted publication never retries');
  assert(
    await publish().isDisabled(),
    'interrupted publication blocks duplicate clicks'
  );
  await page.unroute('**/api/broadcast/publish');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'publication controls fit mobile width'
  );
});
