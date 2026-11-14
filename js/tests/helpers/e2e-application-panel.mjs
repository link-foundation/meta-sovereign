import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gate } from '../../../experiments/issue-56/vacancy-fixture.mjs';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';

export const verifyApplicationPanel = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await applicationNativeFixture(browser);
  const { page } = fixture;
  page.setDefaultTimeout(10000);
  const panel = page.locator('[data-application-panel]');
  const action = (name) => panel.locator(`[data-application-action="${name}"]`);
  const confirm = () =>
    panel.locator('[data-application-option="confirm"]').check();
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    const vacancies = page.locator('[data-vacancies]');
    await vacancies.waitFor();
    if (before) {
      await vacancies.evaluate((element) =>
        element.scrollIntoView({ block: 'end' })
      );
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({
          path: join(screenshots, 'application-before.png'),
        });
      }
      assert.equal(await panel.count(), 0);
      return { missingApplicationControls: true, errors: fixture.errors };
    }
    await panel.waitFor();
    assert.equal(await action('start').isDisabled(), true);
    await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
    await vacancies.locator('[data-vacancy-action="search"]').click();
    await vacancies.locator('[data-vacancy-action="collect"]').first().click();
    await panel.locator('[data-application-missing]').waitFor();
    await panel
      .locator('[data-application-letter]')
      .fill('Owner reviewed letter.');
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    assert.equal(await action('enter').isDisabled(), true);
    assert.equal(
      await vacancies.locator('[data-vacancy-action="search"]').isDisabled(),
      true
    );
    assert.match(
      await panel.locator('[data-application-description]').innerText(),
      /Employer’s final paragraph stays intact\.$/u
    );
    await shot('application-ready-desktop');
    await page.setViewportSize({ width: 390, height: 1440 });
    await shot('application-ready-phone');
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      true
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    const { owned, posts } = await loseEntryResponse({
      page,
      browser,
      action,
      confirm,
    });
    await shot('application-unknown');
    await page.unroute('**/api/vacancies/application-advance');
    await page.reload();
    await panel.locator('[data-application-state="review"]').waitFor();
    assert.equal(await owned.evaluate(() => globalThis.applicationEntries), 1);
    assert.equal(await action('enter').isDisabled(), true);
    assert.equal(await action('prefill').isDisabled(), true);
    await confirm();
    await action('prefill').click();
    await panel.locator('[data-application-letter-state="verified"]').waitFor();
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Five years building Python services.'
    );
    assert.equal(await owned.locator('#header').inputValue(), 'Owner header');
    await panel.locator('[data-form-answer="exact"]').first().waitFor();
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await confirm();
    await action('submit').click();
    await panel
      .locator('[data-application-delivery="provider-confirmed"]')
      .waitFor();
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 1);
    assert.equal(await action('submit').isDisabled(), true);
    await shot('application-delivered');
    await closeReview({ page, panel, owned, fixture, action });
    return {
      entries: 1,
      submissions: 1,
      lostResponsePosts: posts,
      reloadReplayed: false,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};

const loseEntryResponse = async ({ page, browser, action, confirm }) => {
  let posts = 0;
  const completed = gate();
  await page.route('**/api/vacancies/application-advance', async (route) => {
    posts++;
    try {
      await route.fetch();
      await route.abort('failed');
      completed.resolve();
    } catch (error) {
      await route.abort().catch(() => {});
      completed.resolve(error);
    }
  });
  await confirm();
  await action('enter').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-application-unknown]') &&
      !document.querySelector('[data-application-action="recover"]').disabled,
    undefined,
    { timeout: 10000 }
  );
  const error = await completed.promise;
  assert.equal(error, undefined);
  assert.equal(await action('enter').isDisabled(), true);
  assert.equal(posts, 1);
  const owned = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find(
      (entry) =>
        entry.url() === 'https://hh.ru/applicant/vacancy_response?vacancyId=123'
    );
  assert.equal(await owned.evaluate(() => globalThis.applicationEntries), 1);
  const saved = await page.evaluate(() =>
    globalThis.localStorage.getItem('meta-sovereign:hh-application-intent')
  );
  assert.deepEqual(Object.keys(JSON.parse(saved)).sort(), [
    'browserSlot',
    'requestId',
    'url',
  ]);
  return { owned, posts };
};

const closeReview = async ({ page, panel, owned, fixture, action }) => {
  await action('close').click();
  await panel.locator('[data-application-state="closed"]').waitFor();
  assert(owned.isClosed());
  assert.equal(
    await page.evaluate(() =>
      globalThis.localStorage.getItem('meta-sovereign:hh-application-intent')
    ),
    null
  );
  assert.equal(fixture.records.filter((record) => !record.closed).length, 0);
  assert.deepEqual(fixture.errors, []);
};
