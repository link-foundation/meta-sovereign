import { createMemoryStore } from '../src/storage/universal.js';
import { openChatApp, assert } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
for (let n = 1; n <= 5; n++) {
  const base = {
    source: 'telegram',
    chat: String(n),
    chatName: `Fixture ${n}`,
    chatType: 'personal_chat',
  };
  await store.put({
    ...base,
    id: `msg:telegram:${n}:1`,
    sender: String(n),
    body: 'Ты программист?',
    timestamp: new Date(1700000000000 + n * 60000).toISOString(),
  });
  await store.put({
    ...base,
    id: `msg:telegram:${n}:2`,
    sender: 'me',
    body: n <= 3 ? 'Да, программист.' : 'Программист, работаю удалённо.',
    timestamp: new Date(1700000001000 + n * 60000).toISOString(),
  });
}
const { page, base, until, finish } = await openChatApp('history-library', {
  store,
});
await finish(async () => {
  await page.goto(`${base}/#/patterns`);
  const patterns = page.locator('[data-history-library="patterns"]');
  await patterns.locator('.card').first().waitFor();
  assert(
    (await patterns.textContent()).includes('программист'),
    'learned patterns visible without manual records'
  );
  assert(
    (await patterns.locator('[data-library-words]').textContent()).includes(
      'программист (10)'
    ),
    'real word frequency visible'
  );
  const threshold = patterns.locator('[data-action="library-threshold"]');
  await threshold.fill('100');
  await patterns.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    async () => (await patterns.locator('.card').count()) === 0,
    'threshold excludes infrequent examples'
  );
  await threshold.fill('5');
  await patterns.getByRole('button', { name: 'Save', exact: true }).click();
  await patterns.locator('.card').first().waitFor();
  await page.locator('button[data-view="replies"]').click();
  const replies = page.locator('[data-history-library="replies"]');
  await replies.locator('.card').waitFor();
  assert(
    (await replies.textContent()).includes('работаю удалённо'),
    'observed reply variations visible'
  );
  await page.locator('button[data-view="facts"]').click();
  const facts = page.locator('[data-history-library="facts"]');
  await until(
    async () => (await facts.locator('.card').count()) === 5,
    'facts populated from qualified questions'
  );
  assert(
    (await facts.textContent()).includes('Ты программист?'),
    'fact question preserved'
  );
  await page.locator('button[data-view="connections"]').click();
  await page
    .locator('[data-provider-id="telegram"] [data-state="connected"]')
    .waitFor();
  assert(
    (await store.get('library:settings')).minFrequency === 5,
    'threshold persisted'
  );
});
