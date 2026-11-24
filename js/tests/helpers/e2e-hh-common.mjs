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

export const verifyHhCommonReply = async ({ page, base, store, fake }) => {
  await page.goto(`${base}/#/chat`);
  await page.locator('[data-chat="hh:chat:41"]').click();
  const row = page.locator('[data-row="msg:hh:chat:41:1"]');
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Reply', exact: true }).click();
  const text = 'Thank you for asking.';
  const composer = page.locator('.chat-composer textarea');
  await composer.fill(text);
  await composer.press('Enter');
  const id = `msg:hh:chat:41:${fake.state.receipt.id}`;
  const bubble = page.locator(`[data-row="${id}"]`);
  await bubble.waitFor({ timeout: 7000 });
  assert(
    (await bubble.innerText()).includes(text),
    'the acknowledged reply is visible'
  );
  assert(
    (await bubble.locator('.bubble-reply').innerText()).includes(
      'Where do you live?'
    ),
    'the acknowledged reply quotes the actual saved parent'
  );
  assert(
    (await store.get(id))?.replyTo === 'msg:hh:chat:41:1',
    'the saved reply uses the provider receipt'
  );
  const writes = fake.calls.filter((call) => call.method === 'POST');
  assert(
    writes.length === 1 && writes[0].body.reply_to_message_id === '1',
    'HH received one reply to the selected message'
  );
};

export const verifyHhCommonActions = async ({ page, store, fake, until }) => {
  const id = 'msg:hh:chat:41:2';
  const answer = page.locator(`[data-row="${id}"]`);
  const question = page.locator('[data-row="msg:hh:chat:41:1"]');
  const item = (action) =>
    page.locator(`[role="menuitem"][data-action="${action}"]`);
  await answer.click({ button: 'right' });
  assert(
    await item('edit').count(),
    'HeadHunter edit permission overrides Telegram timing'
  );
  await item('edit').click();
  const composer = page.locator('.chat-composer textarea');
  const text = 'I live in Hanoi.';
  await composer.fill(text);
  fake.state.mutationStatus = 200;
  const editFailed = page.waitForResponse((response) =>
    response.url().endsWith('/api/message/edit')
  );
  await composer.press('Enter');
  assert(
    (await editFailed).status() === 502,
    'an unexpected provider receipt is reported'
  );
  assert(
    (await store.get(id)).body === 'Vietnam.',
    'unconfirmed edit preserves the saved message'
  );
  fake.state.mutationStatus = 204;
  await answer.click({ button: 'right' });
  await item('edit').click();
  await composer.fill(text);
  await composer.press('Enter');
  await until(
    async () => (await answer.innerText()).includes(text),
    'acknowledged HH edit'
  );
  assert(
    (await store.get(id)).raw.payload.text === text,
    'the saved edit keeps native text'
  );
  await answer.click({ button: 'right' });
  await item('delete').click();
  const dialog = page.getByRole('dialog');
  assert(
    (await dialog.getByText('Delete for me').count()) === 0,
    'the provider has no local-only delete'
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  assert(
    fake.calls.every((call) => call.method !== 'DELETE'),
    'cancel does not delete'
  );
  await question.click({ button: 'right' });
  assert(
    (await item('delete').count()) === 0,
    'the employer message has no delete action'
  );
  await page.keyboard.press('Escape');
  await answer.click({ button: 'right' });
  await item('delete').click();
  await dialog.getByRole('button', { name: 'Delete in HeadHunter' }).click();
  await until(
    async () => Boolean((await store.get(id)).deleted),
    'acknowledged HH deletion'
  );
  assert(
    fake.calls.filter((call) => call.method === 'DELETE').length === 1,
    'one exact provider deletion'
  );
  assert(
    !(await store.get('msg:hh:chat:41:1')).deleted,
    'the employer message is preserved'
  );
};
