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
const { base, page, finish } = await openChatApp('contacts-directory', {
  store,
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
});
