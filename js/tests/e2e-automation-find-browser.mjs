// Read-only condition inspection against the real planner and a small fixture.
import { createMemoryStore } from '../src/storage/universal.js';
import { automationPresets } from '../src/automation/automations.js';
import { saveSettings } from '../src/automation/safety.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
for (const [chat, age, mutual, chatType] of [
  ['111', 100, true, 'personal_chat'],
  ['222', 80, true, 'personal_chat'],
  ['333', 1, true, 'personal_chat'],
  ['444', 100, false, 'personal_chat'],
  ['900', 100, true, 'group'],
]) {
  for (const sender of mutual ? ['me', chat] : [chat]) {
    await store.put({
      id: `msg:telegram:${chat}:${sender === 'me' ? 1 : 2}`,
      source: 'telegram',
      chat,
      chatType,
      chatName: `Fixture ${chat}`,
      sender,
      body: 'Fixture conversation',
      timestamp: new Date(Date.now() - age * 86400000).toISOString(),
    });
  }
}
const automation = automationPresets().find(
  (item) => item.id === 'automation:job-search'
);
// Finding a match must remain read-only even for an automatic automation.
await store.put({ ...automation, mode: 'auto' });
await saveSettings(store, { quietHours: { enabled: false } });
const sent = [];
const { page, base, until, finish } = await openChatApp('automation-find', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fixture' };
  },
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
});
const queries = [];
let release = null;
let hold = false;
let fail = false;
let interrupted = false;
await page.route('**/api/automations/next', async (route) => {
  queries.push(route.request().postDataJSON());
  if (hold) {
    await new Promise((resolve) => {
      release = resolve;
    });
  }
  if (interrupted) {
    interrupted = false;
    return fulfil(
      route,
      { code: 'server-starting', error: 'fixture reconnecting' },
      503
    );
  }
  return fail
    ? fulfil(route, { error: 'fixture matching failure' }, 422)
    : route.continue();
});
const button = () =>
  page.locator(
    '[data-action="chat-automation-find"][data-automation="automation:job-search"]'
  );
const menu = async () => {
  await page.locator('[data-action="chat-automations"]').click();
  await button().waitFor();
};
const current = () =>
  page.evaluate(() => globalThis.location.hash.split(':').at(-1));
const noDelivery = async () => {
  assert(sent.length === 0, 'condition inspection never sends');
  assert(
    (await store.query((link) => /^automation-(draft|run):/.test(link.id)))
      .length === 0,
    'condition inspection writes no draft or run ledger'
  );
  assert(
    (await page.locator('.draft-card').count()) === 0,
    'no draft is opened or prefilled'
  );
  assert(
    queries.every((query) => query.queue === false),
    'every lookup explicitly stays read-only'
  );
};

const matchingSteps = async () => {
  await page.goto(`${base}/#chat=telegram:900`);
  await page.locator('[data-row="msg:telegram:900:2"]').waitFor();
  await menu();
  const controls = await button().evaluate((node) =>
    [...node.parentElement.querySelectorAll('button')].map((control) => ({
      width: control.getBoundingClientRect().width,
      height: control.getBoundingClientRect().height,
    }))
  );
  assert(
    controls.every(
      (control) => Math.abs(control.width - controls[0].width) < 1
    ),
    'automation actions share aligned grid columns'
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
  hold = true;
  await button().click();
  assert(await button().isDisabled(), 'finding disables repeated actions');
  assert(
    (await button().getAttribute('aria-busy')) === 'true',
    'finding gives immediate progress'
  );
  await until(() => Boolean(release), 'read-only lookup starts');
  assert(
    queries.length === 1 &&
      queries[0].exclude.some((item) => item.chat === '900'),
    'the current chat is excluded'
  );
  hold = false;
  release();
  await until(
    async () => ['111', '222'].includes(await current()),
    'a truly eligible chat opens'
  );
  const first = await current();
  await noDelivery();
  await menu();
  await button().click();
  await until(
    async () =>
      ['111', '222'].includes(await current()) && (await current()) !== first,
    'repeated finding opens the other matching chat'
  );
  const second = await current();
  await noDelivery();
  await menu();
  await button().click();
  await page.locator('[data-notice="no-matching-chat"]').waitFor();
  assert((await current()) === second, 'no match keeps the current chat');
  assert(
    (
      await page.locator('[data-notice="no-matching-chat"]').textContent()
    ).includes('No more chats match'),
    'no-match feedback is localized and explicit'
  );
  await button().click();
  await until(
    async () => (await current()) === first,
    'an exhausted search can restart'
  );
};

const failureAndLateSteps = async () => {
  await menu();
  fail = true;
  await button().click();
  await page.locator('[data-notice="failed"]').waitFor();
  assert(
    (await page.locator('[data-notice="failed"]').textContent()).includes(
      'fixture matching failure'
    ),
    'a lookup failure is not presented as no matches'
  );
  fail = false;
  interrupted = true;
  await button().click();
  await page.locator('[data-notice="no-matching-chat"]').waitFor();
  hold = true;
  release = null;
  await button().click();
  await until(() => Boolean(release), 'a second lookup starts');
  await page.locator('[data-chat="telegram:333"]').click();
  await until(
    async () => (await current()) === '333',
    'manual navigation wins'
  );
  hold = false;
  release();
  await page.waitForTimeout(300);
  assert(
    (await current()) === '333',
    'a late result cannot change the newly selected conversation'
  );
  release = null;
  hold = true;
  await menu();
  await button().click();
  await until(() => Boolean(release), 'lookup starts before leaving Chat');
  await page.locator('button[data-view="contacts"]').first().click();
  await page.locator('main[data-view="contacts"]').waitFor();
  hold = false;
  release();
  await page.waitForTimeout(300);
  assert(
    await page.locator('main[data-view="contacts"]').isVisible(),
    'a late result cannot reopen Chat after its view was closed'
  );
  await noDelivery();
};

await finish(async () => {
  await matchingSteps();
  await failureAndLateSteps();
});
