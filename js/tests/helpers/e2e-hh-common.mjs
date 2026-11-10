import { assert } from './e2e-chat.mjs';

export const verifyHhCommon = async ({
  page,
  base,
  store,
  until,
  fake,
  before = false,
  advance = () => {},
}) => {
  await page.goto(`${base}/`);
  await page.locator('button[data-view="connections"]').click();
  const card = page.locator('[data-provider-id="hh"]');
  await card.waitFor();
  await card.scrollIntoViewIfNeeded();
  const button = card.locator('[data-action="fetch-now"]');
  if (before) {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-common-before.png',
    });
    assert(
      await button.count(),
      'HH has a shared fetch control for actual live history'
    );
    return;
  }
  const status = card.locator('[data-fetch-status]');
  await button.click();
  await until(
    async () => (await status.getAttribute('data-fetch-status')) === 'error',
    'HH asks for a token'
  );
  assert(
    (await status.textContent()).includes('access token'),
    'missing HH token is actionable'
  );
  await store.put({
    id: 'secret:hh:access-token',
    tokens: ['secret'],
    children: [],
    token: 'fixture-token',
  });
  // Reload the same Connections surface so its saved-token badge is current.
  await page.reload();
  await card.waitFor();
  await card.scrollIntoViewIfNeeded();
  await button.click();
  await until(
    async () => (await status.textContent()).includes('History is partial'),
    'HH partial history reported'
  );
  assert(
    (await status.getAttribute('data-fetch-status')) === 'wait',
    'partial history is not a completed fetch'
  );
  if (process.env.HH_COMMON_SCREENSHOTS === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-common-partial.png',
    });
  }
  for (
    let step = 0;
    step < 3 && (await status.getAttribute('data-fetch-status')) !== 'ok';
    step++
  ) {
    advance();
    await button.click();
    await until(
      async () => (await button.getAttribute('aria-busy')) !== 'true',
      'HH continuation finishes'
    );
  }
  assert(
    (await status.textContent()).includes('5 messages across 2 chats'),
    'HH reports only the available API window'
  );
  assert(
    (await status.getAttribute('data-fetch-status')) === 'ok',
    'HH available history checked'
  );
  if (process.env.HH_COMMON_SCREENSHOTS === '1') {
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-common-after.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await card.scrollIntoViewIfNeeded();
    await until(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth === globalThis.innerWidth
        ),
      'HH controls fit a phone'
    );
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-common-mobile.png',
    });
    await page.setViewportSize({ width: 1200, height: 800 });
  }
  await page.goto(`${base}/#/chat`);
  await page.locator('[data-chat="hh:chat:41"]').click();
  const question = page.locator('[data-row="msg:hh:chat:41:1"] .bubble-body');
  const answer = page.locator('[data-row="msg:hh:chat:41:2"] .bubble-body');
  await question.waitFor();
  await answer.waitFor();
  assert(
    (await question.textContent()).includes('Where do you live?'),
    'actual employer question is visible'
  );
  assert(
    (await answer.textContent()).includes('Vietnam.'),
    'actual applicant answer is visible'
  );
  if (process.env.HH_COMMON_ALIGNMENT_BEFORE === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-common-alignment-before.png',
    });
  }
  assert(
    (await page
      .locator('[data-row="msg:hh:chat:41:2"]')
      .getAttribute('data-mine')) === 'true',
    'the current participant renders as an outgoing bubble'
  );
  if (process.env.HH_COMMON_SCREENSHOTS === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-common-chat.png',
    });
  }
  assert(
    (await store.get('msg:hh:chat:41:2')).outgoing === true,
    'applicant message keeps its real direction'
  );
  assert(
    fake.calls.every((call) => call.method === 'GET'),
    'history import neither sends nor marks read'
  );
};
