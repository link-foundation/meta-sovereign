import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { followLinksFixture } from './helpers/follow-links.mjs';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';

const f = await followLinksFixture();
const { page, base, finish } = await openChatApp('follow-links', f);
page.setDefaultTimeout(10000);
await page.addInitScript(
  ({ key, version }) => {
    globalThis.localStorage.setItem(
      key,
      JSON.stringify({ off: true, v: version })
    );
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  },
  { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
);
const panel = page.locator('[data-follow-panel]');
const action = (name) => panel.locator(`[data-follow-action="${name}"]`);
const show = async () => {
  await page.goto(`${base}/#/automation`);
  await panel.locator(':scope > summary').click();
  await panel.locator('[data-follow-results]').waitFor();
};
await finish(async () => {
  await show();
  await panel
    .getByText('0 cached message references', { exact: true })
    .waitFor();
  await action('extract').click();
  await panel
    .getByText('4 cached message references', { exact: true })
    .waitFor();
  assert(
    (await panel.locator('[data-follow-reference]').count()) === 4,
    'incoming references retain both source messages'
  );
  await page.reload();
  await panel.locator(':scope > summary').click();
  await panel
    .getByText('4 cached message references', { exact: true })
    .waitFor();
  await action('extract').click();
  await panel
    .getByText(
      'Scanned 2 of 2 matching incoming messages. Found 4 references; added 0.',
      { exact: true }
    )
    .waitFor();
  await page.route('**/api/automations/follow/extract', (route) =>
    fulfil(
      route,
      { error: 'fixture storage unavailable', code: 'storage-error' },
      400
    )
  );
  await action('extract').click();
  await panel.getByRole('alert').waitFor();
  assert(
    (await panel.locator('[data-follow-reference]').count()) === 4,
    'failed extraction retains cached references'
  );
  await page.unroute('**/api/automations/follow/extract');
  await page.route('**/api/automations/follow/extract', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'text/plain',
      body: '',
    })
  );
  await action('extract').click();
  await panel.getByRole('alert').waitFor();
  assert(
    (await panel.locator('[data-follow-reference]').count()) === 4,
    'an empty error response never switches cache stores'
  );
  await page.unroute('**/api/automations/follow/extract');
  await panel.getByLabel('Provider (blank: all)', { exact: true }).fill('vk');
  await action('load').click();
  await panel
    .getByText('2 cached message references', { exact: true })
    .waitFor();
  await action('clear').click();
  await action('cancel').click();
  assert(
    (await panel.locator('[data-follow-reference]').count()) === 2,
    'cancel retains references'
  );
  await action('clear').click();
  await action('confirmClear').click();
  await panel
    .getByText('0 cached message references', { exact: true })
    .waitFor();
  await panel.getByLabel('Provider (blank: all)', { exact: true }).fill('');
  await action('load').click();
  await panel
    .getByText('2 cached message references', { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'cache controls fit a phone viewport'
  );
  for (const message of f.messages) {
    assert(
      Boolean(await f.store.get(message.id)),
      'cache clearing preserves source messages'
    );
  }
});
