// Real local recovery files and production Lino API; isolated memory store,
// temporary archive folder and no accounts. Both engines are checked in CI.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const original = {
  id: 'note:recovery',
  tokens: ['note'],
  body: 'Restore this local note',
};
await store.put(original);
const { page, base, until, finish } = await openChatApp('backup', {
  store,
  fileBackups: true,
});
const status = page.locator('[data-backup-status]');
const hours = page.locator('[data-field="backup-hours"]');
const text = page.locator('[data-field="backup-text"]');
const binary = page.locator('[data-field="backup-binary"]');
const save = page.locator('[data-action="backup-save"]');
const create = page.locator('[data-action="backup-create"]');

await finish(async () => {
  await page.goto(`${base}/#backup`);
  await hours.waitFor({ timeout: 10_000 });
  assert((await hours.inputValue()) === '24', 'daily default');
  assert(
    (await text.isChecked()) && (await binary.isChecked()),
    'both formats by default'
  );
  await hours.fill('0');
  await page.locator('[data-field="backup-retention"]').fill('1');
  await text.uncheck();
  await save.click();
  await until(
    async () => (await status.textContent()).includes('settings saved'),
    'settings saved'
  );
  await page.reload();
  await hours.waitFor();
  assert(
    (await hours.inputValue()) === '0',
    'disabled schedule survives reload'
  );
  assert(
    !(await text.isChecked()) && (await binary.isChecked()),
    'saved formats survive reload'
  );
  await text.check();
  await save.click();
  await until(
    async () => (await status.textContent()).includes('settings saved'),
    'both formats saved'
  );
  await create.click();
  await until(
    async () =>
      (await status.textContent()).includes(
        '2 independent recovery dumps verified'
      ),
    'actual files verified'
  );
  await until(
    async () => (await page.locator('[data-backup-file]').count()) === 3,
    'archive and both dumps listed'
  );
  await store.put({ ...original, body: 'changed after backup' });
  const dump = page
    .locator('[data-backup-file]')
    .filter({ hasText: 'Binary Lino dump' });
  await dump.getByRole('button', { name: 'Restore', exact: true }).click();
  assert(
    (await store.get(original.id)).body === 'changed after backup',
    'nothing written before confirmation'
  );
  await page.locator('[data-action="backup-restore-yes"]').click();
  await until(
    async () => (await status.textContent()).includes('Restored'),
    'restore confirmed'
  );
  assert(
    (await store.get(original.id)).body === original.body,
    'binary dump really restores'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'mobile page has no horizontal overflow'
  );
  await page.route('**/api/backups', (route) =>
    route.request().method() === 'POST'
      ? fulfil(route, { ok: false, error: 'Recovery fixture refusal' }, 500)
      : route.continue()
  );
  await create.click();
  await until(
    async () =>
      (await status.textContent()).includes('Recovery fixture refusal'),
    'server refusal remains visible'
  );
  assert(
    !(await status.textContent()).includes('Backup verified'),
    'refusal never claims success'
  );
  await page.route('**/api/backups/settings', (route) =>
    fulfil(route, { available: false })
  );
  await page.reload();
  await page
    .getByText('File backups require a connected server', { exact: false })
    .waitFor();
  assert(
    (await create.count()) === 0,
    'unsupported server does not offer file operations'
  );
});
