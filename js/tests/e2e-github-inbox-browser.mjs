// Real browser e2e for the GitHub repository picker and "Fetch now"
// (R-Z11): on the GitHub Connections card the user opens the picker, filters
// and ticks repositories, saves the choice (owner/repo stored in settings)
// and fetches through the shared pull runner (R-Z8). The fake GitHub answers behind a real local server; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:github-inbox
//   RUN_BROWSER_E2E=1 E2E_BROWSER=webkit npm run test:e2e:github-inbox

import { createMemoryStore } from '../src/storage/universal.js';
import { createGithubLive } from '../src/sources/github.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import { startFakeGithub } from './helpers/fake-github.mjs';

const T0 = '2026-01-01T00:00:00Z';
const fake = await startFakeGithub({
  repos: {
    'o/alpha': {
      issues: [
        {
          id: 1,
          number: 1,
          title: 'First',
          body: 'b',
          user: { login: 'ann' },
          created_at: T0,
          updated_at: T0,
          url: 'https://api.github.com/repos/o/alpha/issues/1',
        },
      ],
    },
    'o/beta': {},
  },
  userRepos: [
    { id: 1, full_name: 'o/alpha', private: false },
    { id: 2, full_name: 'o/beta', private: true },
    { id: 3, full_name: 'o/gamma', private: false },
  ],
});

const store = createMemoryStore();
await store.put({ id: 'secret:github:access-token', token: 'pat' });

const { base, page, until, finish } = await openChatApp('github-inbox', {
  store,
  serverOptions: {
    pulls: {
      githubLiveFactory: (options) =>
        createGithubLive({
          ...options,
          owner: null,
          repo: null,
          baseUrl: fake.baseUrl,
        }),
    },
  },
});

await finish(async () => {
  await page.goto(base, { waitUntil: 'load' });
  await page.click('button[data-view="connections"]');
  await page.click(
    'article[data-provider-id="github"] button[data-action="open-connection-detail"]'
  );
  await page.waitForSelector('[data-role="github-inbox"]');
  const fetchBtn = '[data-action="fetch-now"][data-target-provider="github"]';
  assert(await page.isDisabled(fetchBtn), 'Fetch now waits for a choice');

  await page.click('[data-action="github-load-repos"]');
  await page.waitForSelector('[data-role="github-repo-picker"]');
  const boxes = await page.$$('[data-action^="github-repo:"]');
  assert(boxes.length === 3, `three repositories listed, got ${boxes.length}`);

  await page.fill(
    '[data-role="github-repo-picker"] input[type="search"]',
    'gam'
  );
  await until(
    async () => (await page.$$('[data-action^="github-repo:"]')).length === 1,
    'the filter narrows the list'
  );
  await page.fill('[data-role="github-repo-picker"] input[type="search"]', '');
  await page.check('[data-action="github-repo:o/alpha"]');
  await page.check('[data-action="github-repo:o/beta"]');
  assert(!(await page.isDisabled(fetchBtn)), 'Fetch now enabled once chosen');

  await page.click('[data-action="github-save-settings"]');
  await until(async () => {
    const saved = await store.get('settings:github');
    return saved?.repos?.join() === 'o/alpha,o/beta';
  }, 'owner/repo stored in settings');

  await page.click(fetchBtn);
  await until(
    async () =>
      (await page.textContent('[data-fetch-status]')).includes('Fetched.'),
    'the fetch result is shown'
  );
  assert(await store.get('msg:github:issue:o/alpha#1'), 'the issue was stored');
  assert(await store.get('cursor:github:o/alpha'), 'the cursor was saved');
  await fake.close();
});
