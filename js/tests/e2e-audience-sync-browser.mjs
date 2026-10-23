// Real browser e2e for the audience members button (R-Z7, R-X13): on the
// Automation screen "Refresh members" asks the server to read the friends
// and members the saved audiences name, and the page says how many came
// and which network failed. The server's answer is faked in the page, so
// no network is asked. Run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:audience-sync

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
await store.put({
  id: 'audience:vip',
  tokens: ['audience', 'vip'],
  name: 'vip',
  text: 'friends:vk',
  spec: { kind: 'friends', source: 'vk' },
});

const { base, page, until, finish } = await openChatApp('audience-sync', {
  store,
});
const asked = [];
await page.route('**/api/audience/sync', (route) => {
  asked.push(route.request().postDataJSON());
  return fulfil(route, {
    ok: false,
    sources: [
      { source: 'vk', ok: true, groups: 1, members: 5 },
      {
        source: 'telegram',
        ok: false,
        groups: 0,
        members: 0,
        error: 'no token',
      },
    ],
  });
});

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator('button[data-view="automation"]').click();
  const button = page.locator('[data-action="audience-sync"]');
  await button.waitFor({ timeout: 10000 });
  await button.click();
  const result = page.locator('[data-sync-result]');
  await until(
    async () =>
      (await result.count()) > 0 &&
      /5 members/.test(await result.textContent()),
    'the result says 5 members'
  );
  assert(
    (await result.textContent()).includes('no token'),
    'a failure is told'
  );
  assert(asked.length === 1, 'one request');
});
