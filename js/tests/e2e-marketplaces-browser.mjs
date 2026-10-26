// Issue #42: manual login windows and saved profiles for all four services.
// Every provider page is a local HTML fixture. No personal account is opened.
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  MARKETPLACES,
  marketplaceProfileId,
} from '../src/marketplaces/catalogue.js';
import { createMarketplaceSessions } from '../src/marketplaces/sessions.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const urls = {
  upwork: 'https://www.upwork.com/freelancers/~fake123',
  fiverr: 'https://www.fiverr.com/fake_person',
  peopleperhour:
    'https://www.peopleperhour.com/freelancer/development-it/fake-person-123',
  wellfound: 'https://wellfound.com/u/fake-person',
};
const store = createMemoryStore();
const { base, page, until, finish } = await openChatApp('marketplaces', {
  store,
});
const browser = page.context().browser();
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-marketplace-browser-'));
const providerPages = new Map();
const launches = [];
const options = {
  store,
  storeDir: dir,
  openSession: async (args) => {
    launches.push(args);
    const providerPage = await browser.newPage();
    providerPages.set(args.platform, providerPage);
    await providerPage.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const profile = url.href === urls[args.platform];
      const name = `Example ${MARKETPLACES[args.platform].label}`;
      const structured = JSON.stringify({
        '@type': 'ProfilePage',
        mainEntity: {
          '@type': 'Person',
          url: url.href,
          name,
          jobTitle: 'Software developer',
          description: 'Fixture profile description',
        },
      });
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: profile
          ? `<title>${name}</title><script type="application/ld+json">${structured}</script><main><h1>${name}</h1><ul data-test="skills"><li>JavaScript</li><li>Testing</li></ul><a href="/logout">Log out</a><input name="password" type="password" value="PASSWORD-MUST-NOT-LEAVE"></main>`
          : '<title>Sign in</title><main><h1>Welcome back</h1><input name="password" type="password" value="PASSWORD-MUST-NOT-LEAVE"></main>',
      });
    });
    return {
      page: providerPage,
      close: () => providerPage.close(),
      context: {
        cookies: () => {
          throw new Error('No cookie extraction');
        },
      },
    };
  },
};
let sessions = createMarketplaceSessions(options);
await page.route('**/api/marketplaces', async (route) =>
  fulfil(route, { ok: true, accounts: await sessions.list() })
);
await page.route('**/api/marketplaces/*/*', async (route) => {
  const [, id, action] = /\/marketplaces\/([^/]+)\/([^/]+)$/.exec(
    new URL(route.request().url()).pathname
  );
  try {
    const method = { open: 'open', profile: 'capture', close: 'close' }[action];
    return fulfil(route, { ok: true, account: await sessions[method](id) });
  } catch (error) {
    return fulfil(
      route,
      { ok: false, code: error.code, error: 'action needs attention' },
      409
    );
  }
});

const checkProvider = async (id) => {
  const card = page.locator(`[data-marketplace-id="${id}"]`);
  await card.locator('[data-action="marketplace-open"]').click();
  await until(
    async () =>
      (await card
        .locator('[data-session-open]')
        .getAttribute('data-session-open')) === 'true',
    `${id} window opened`
  );
  assert(
    launches.at(-1).headless === false,
    `${id} requests a visible browser`
  );
  assert(
    launches.at(-1).profileDir === path.join(dir, 'browser-profiles', id),
    `${id} keeps its own app profile`
  );
  await card.locator('[data-action="marketplace-profile"]').click();
  await until(
    async () => (await card.locator('[role="alert"]').count()) === 1,
    `${id} rejects login page as a profile`
  );
  assert(
    !(await store.get(marketplaceProfileId(id))),
    `${id} has no fake signed-in profile`
  );
  // The person, rather than the app, signs in and opens their own profile.
  await providerPages.get(id).goto(urls[id]);
  await providerPages.get(id).evaluate(() => {
    Object.defineProperty(document, 'cookie', {
      get: () => {
        throw new Error('cookie access');
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => {
        throw new Error('storage access');
      },
    });
  });
  await card.locator('[data-action="marketplace-profile"]').click();
  await until(
    async () => (await card.locator('[data-saved-profile]').count()) === 1,
    `${id} profile saved`
  );
  assert(
    (await card.textContent()).includes(`Example ${MARKETPLACES[id].label}`),
    `${id} name displayed`
  );
  assert(
    (await card.textContent()).includes('Software developer'),
    `${id} headline displayed`
  );
  const saved = await store.get(marketplaceProfileId(id));
  assert(
    saved.profile.signInObservedAt,
    `${id} sign-out control supplies positive evidence`
  );
  assert(
    !JSON.stringify(saved).includes('PASSWORD-MUST-NOT-LEAVE'),
    `${id} password not copied`
  );
  await card.locator('[data-action="marketplace-close"]').click();
  await until(
    async () =>
      (await card
        .locator('[data-session-open]')
        .getAttribute('data-session-open')) === 'false',
    `${id} session closed`
  );
  assert(
    (await card.locator('[data-saved-profile]').count()) === 1,
    `${id} profile remains after closing`
  );
};

await finish(async () => {
  try {
    await page.goto(base);
    await page.locator('button[data-view="connections"]').click();
    await until(
      async () => (await page.locator('[data-marketplace-id]').count()) === 4,
      'four issue #42 services'
    );
    for (const id of Object.keys(MARKETPLACES)) {
      await checkProvider(id);
    }
    await sessions.stop();
    sessions = createMarketplaceSessions(options);
    await page.locator('button[data-view="profile"]').click();
    await until(
      async () =>
        (await page
          .locator('.marketplace-accounts [data-saved-profile]')
          .count()) === 4,
      'all saved profiles in Profile after controller restart'
    );
    const card = page.locator('[data-marketplace-id="fiverr"]');
    await card.locator('[data-action="marketplace-open"]').click();
    await until(
      async () =>
        (await card
          .locator('[data-session-open]')
          .getAttribute('data-session-open')) === 'true',
      'reopen saved profile'
    );
    assert(
      providerPages.get('fiverr').url() === urls.fiverr,
      'reopen resumes the saved profile URL'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      (await page.locator('.marketplace-account').count()) === 4,
      'phone retains all four profile cards'
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > globalThis.innerWidth + 1
    );
    assert(!overflow, 'profile cards fit a phone without horizontal overflow');
  } finally {
    await sessions.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
