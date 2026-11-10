import { assert } from './e2e-chat.mjs';
import { LINO_TEXT, encodeWire, decodeWire } from '../../src/transport/lino.js';

const screenshot = async (page, name) => {
  if (process.env.FORMS_CAPACITY_SCREENSHOTS === '1') {
    await page.locator('[data-form-capacity]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `docs/screenshots/issue-56-forms-capacity-${name}.png`,
    });
  }
};
export const verifyFormCapacityUi = async ({
  page,
  base,
  owned,
  fixture,
  until,
}) => {
  const initialCount = owned.length;
  const initialSubmits = fixture.submits;
  const input = page.locator('[data-form-capacity-value]');
  if (process.env.FORMS_CAPACITY_BEFORE === '1') {
    await page.locator('[data-form-reviews]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-capacity-before.png',
    });
    assert(await input.count(), 'browser capacity is configurable');
    return;
  }
  const save = page.locator('[data-action="save-form-capacity"]');
  await until(() => input.isEnabled(), 'capacity loaded from the server');
  await input.fill('17');
  await save.click();
  await until(() => save.isDisabled(), 'capacity save acknowledged');
  await page.reload();
  await until(
    async () => (await input.inputValue()) === '17',
    'capacity survives reload'
  );
  assert(
    owned.length === initialCount,
    'raising capacity alone opens no browsers'
  );
  await page.locator('[data-form-url]').fill(fixture.url);
  await page.locator('[data-form-slot]').fill('application-2');
  await input.fill('1');
  await save.click();
  await until(() => save.isDisabled(), 'one browser capacity acknowledged');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-form-review]').waitFor();
  const owner = owned.at(-1);
  await owner.page
    .locator('[name="fullName"]')
    .fill('Owner retains this answer');
  await page.locator('[data-form-slot]').fill('application-3');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-form-review-error="form-session-limit"]').waitFor();
  assert(
    owned.length === initialCount + 1 && !owner.closed,
    'capacity refusal does not open or close a browser'
  );
  const request = await page.request.get(`${base}/api/forms/sessions`, {
    headers: { accept: LINO_TEXT },
  });
  const listing = decodeWire(await request.body(), LINO_TEXT);
  await page.request.post(`${base}/api/forms/sessions/capacity`, {
    headers: { accept: LINO_TEXT, 'content-type': LINO_TEXT },
    data: encodeWire(
      { maxSessions: 18, revision: listing.revision },
      LINO_TEXT
    ),
  });
  await input.fill('19');
  await save.click();
  await page
    .locator('[data-form-review-error="form-capacity-changed"]')
    .waitFor();
  assert(
    (await input.inputValue()) === '19',
    'stale save retains the owner input'
  );
  await screenshot(page, 'stale');
  await page.locator('[data-action="refresh-form-reviews"]').click();
  await until(
    async () => (await input.inputValue()) === '18',
    'explicit refresh loads actual capacity'
  );
  await input.fill('4');
  await save.click();
  await until(() => save.isDisabled(), 'default capacity restored');
  assert(
    (await owner.page.locator('[name="fullName"]').inputValue()) ===
      'Owner retains this answer',
    'settings preserve unsaved form answers'
  );
  await screenshot(page, 'after');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'capacity fits a phone'
  );
  await screenshot(page, 'mobile');
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator('[data-review-action="close"]').click();
  await until(
    async () => (await page.locator('[data-form-review]').count()) === 0,
    'capacity fixture closed'
  );
  assert(
    owner.closed && fixture.submits === initialSubmits,
    'capacity closes its browser without adding submissions'
  );
  console.log(
    '[forms-capacity]',
    JSON.stringify({
      saved: 17,
      persisted: true,
      refusal: true,
      staleInput: '19',
      ownerPreserved: true,
      closed: owner.closed,
      submits: fixture.submits - initialSubmits,
    })
  );
};
