// Contacts stays open while a sync writes people, without a reload.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const person = (user, name) => ({
  id: `person:telegram:${user}`,
  tokens: ['person'],
  source: 'telegram',
  user,
  name,
  contact: true,
});
await store.put(person('11', 'Ann Lee'));
let denied = false;
let systemReads = 0;
const { base, page, finish } = await openChatApp('contacts-directory', {
  store,
  serverOptions: {
    systemContactsReader: async () => {
      systemReads += 1;
      if (denied) {
        throw Object.assign(new Error('Contacts permission denied'), {
          code: 'contacts-permission-denied',
        });
      }
      return [
        {
          uid: 'cloud',
          name: 'Cloud Contact',
          emails: ['cloud@example.test'],
          phones: ['+1 555 0101'],
        },
      ];
    },
  },
});
await finish(async () => {
  await page.goto(base);
  await page.locator('button[data-view="contacts"]').click();
  const directory = page.locator('main[data-view="contacts"]');
  await directory.getByText('Contacts (1)', { exact: true }).waitFor();
  await store.put(person('12', 'Bob Ray'));
  await directory.getByText('Contacts (2)', { exact: true }).waitFor();
  const search = directory.getByRole('searchbox');
  await search.fill('Bob');
  await store.put(person('12', 'Robert Ray'));
  await directory
    .getByText('Bob Ray', { exact: true })
    .waitFor({ state: 'detached' });
  assert(
    (await search.inputValue()) === 'Bob',
    'live refresh preserves search'
  );
  await search.fill('');
  await directory.getByText('Robert Ray', { exact: true }).waitFor();

  assert(
    systemReads === 0,
    'opening Contacts does not read the system address book'
  );
  await directory.locator('[data-action="contacts-import-system"]').click();
  const preview = directory.locator('[data-contacts-preview]');
  await preview.getByText(/Cloud Contact/).waitFor();
  assert(
    (await store.query((l) => l.source === 'addressbook')).length === 0,
    'preview does not write'
  );
  await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
  await directory.locator('[data-action="contacts-import-system"]').click();
  await preview.locator('[data-action="contacts-import-apply"]').click();
  await directory.getByText('Contacts (3)', { exact: true }).waitFor();
  await search.fill('cloud@example.test');
  await directory
    .locator('tbody')
    .getByText('Cloud Contact', { exact: true })
    .waitFor();
  assert(
    (await directory.locator('tbody button').count()) === 0,
    'an imported address-book record has no invented messenger chat'
  );
  await search.fill('');

  const upload = directory.locator('[data-field="contacts-vcard"]');
  const exported = {
    name: 'icloud-export.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(
      'BEGIN:VCARD\nVERSION:3.0\nUID:file-contact\nFN:File Contact\nEMAIL:file@example.test\nEND:VCARD'
    ),
  };
  await upload.setInputFiles(exported);
  await preview.getByText(/File Contact/).waitFor();
  await preview.locator('[data-action="contacts-import-apply"]').click();
  await directory.getByText('Contacts (4)', { exact: true }).waitFor();
  await upload.setInputFiles(exported);
  await preview
    .getByText('0 new, 0 to update, 1 unchanged or skipped.', { exact: true })
    .waitFor();
  assert(
    await preview.locator('[data-action="contacts-import-apply"]').isDisabled(),
    'repeat import has no duplicates to save'
  );
  await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
  denied = true;
  await directory.locator('[data-action="contacts-import-system"]').click();
  await directory
    .getByRole('alert')
    .filter({ hasText: 'Allow Contacts access' })
    .waitFor();
  await upload.setInputFiles({
    name: 'invalid.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from('not vCards'),
  });
  await directory
    .getByRole('alert')
    .filter({ hasText: 'Could not import' })
    .waitFor();

  await store.putMany(
    Array.from({ length: 105 }, (_, i) => person(`extra-${i}`, `Extra ${i}`))
  );
  await directory.getByText('Contacts (109)', { exact: true }).waitFor();
  assert(
    (await directory.locator('tbody tr').count()) === 100,
    'large directories render a page at a time'
  );
  await directory.locator('[data-action="contacts-more"]').click();
  assert(
    (await directory.locator('tbody tr').count()) === 109,
    'more contacts are available'
  );
});
