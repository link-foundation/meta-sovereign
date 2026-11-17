import assert from 'node:assert/strict';
import { jobLoginBrowserFixture } from '../../../experiments/issue-56/job-login-browser-fixture.mjs';
import { captureVkAutomationLayouts } from './vk-automation-browser.mjs';

const captureFailure = async (page, panel) => {
  if (process.env.JOBS_LOGIN_SCREENSHOTS === '1') {
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-jobs-login/recovery-failure.png',
    });
  }
};
const loseCloseResponse = async (page) => {
  const lost = Promise.withResolvers();
  await page.route('**/api/vacancies/login-close', async (route) => {
    try {
      await route.fetch();
      await route.abort('failed');
      lost.resolve();
    } catch (error) {
      lost.reject(error);
    }
  });
  return lost;
};
const enterManualFields = async (provider) => {
  for (const name of ['account', 'password', 'captchaText']) {
    assert.equal(
      await provider.locator(`input[name=${name}]`).inputValue(),
      ''
    );
  }
  // These actions belong to the test's human actor, never to the login service.
  await provider.locator('input[name=account]').fill('synthetic-owner');
  await provider.locator('input[name=password]').fill('synthetic-owner-secret');
  await provider
    .locator('input[name=captchaText]')
    .fill('synthetic-human-answer');
};

/** Manual CAPTCHA remains human-owned; login requests never replay on recovery. */
export const verifyJobsManualLogin = async (browser) => {
  const fixture = await jobLoginBrowserFixture(browser);
  const { page } = fixture;
  page.context().setDefaultTimeout(10000);
  const panel = page.locator('[data-job-login]');
  const action = (name) => panel.locator(`[data-job-login-action=${name}]`);
  const stateIs = (state) =>
    panel.locator(`[data-job-login-state="${state}"]`).waitFor();
  const mutations = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      request.method() === 'POST' &&
      url.pathname.startsWith('/api/vacancies/login-')
    ) {
      mutations.push(url.pathname);
    }
  });
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await stateIs('none');
    await page
      .locator('[data-vacancy-field=browserSlot]')
      .fill('manual-account');
    await page.locator('[data-vacancy-field=mode]').selectOption('headless');
    await stateIs('none');
    await action('open').click();
    await panel.getByRole('alert').waitFor();
    assert.match(
      await panel.getByRole('alert').textContent(),
      /visible browser/iu
    );
    assert.equal(fixture.records.length, 0);
    assert.equal(await action('open').isDisabled(), true);
    await action('reload').click();
    await stateIs('none');
    await page.locator('[data-vacancy-field=mode]').selectOption('visible');
    const screenshots =
      process.env.JOBS_LOGIN_SCREENSHOTS === '1'
        ? 'docs/screenshots/issue-56-jobs-login'
        : undefined;
    await captureVkAutomationLayouts(
      page,
      panel,
      screenshots,
      'before-sign-in',
      true
    );
    await page.setViewportSize({ width: 1180, height: 950 });
    await action('open').click();
    await stateIs('browser-open');
    assert.match(await panel.textContent(), /Authentication is unverified/u);
    assert.equal(
      await page.locator('[data-vacancy-action=search]').isDisabled(),
      true
    );
    const provider = fixture.providerPages[0];
    await enterManualFields(provider);
    await page.reload();
    await stateIs('browser-open');
    assert.equal(fixture.records.length, 1);
    assert.equal(
      await provider.locator('input[name=captchaText]').inputValue(),
      'synthetic-human-answer'
    );
    await captureVkAutomationLayouts(
      page,
      panel,
      screenshots,
      'manual-sign-in-open',
      true
    );
    await page.setViewportSize({ width: 1180, height: 950 });
    const lost = await loseCloseResponse(page);
    await action('close').click();
    await lost.promise;
    await stateIs('unknown');
    assert.equal(await action('open').isDisabled(), true);
    await page.unroute('**/api/vacancies/login-close');
    await action('reload').click();
    await stateIs('closed');
    assert.equal(await action('open').isEnabled(), true);
    assert.deepEqual(mutations, [
      '/api/vacancies/login-open',
      '/api/vacancies/login-open',
      '/api/vacancies/login-close',
    ]);
    assert.equal(fixture.records.length, 1);
    assert.equal(fixture.records[0].options.headless, false);
    assert.equal(fixture.records[0].options.slot, 'manual-account');
    assert.equal(fixture.records[0].closed, true);
    assert.equal(fixture.records[0].clicks, 0);
    assert.deepEqual(fixture.errors, []);
    return {
      visibleLaunchRequested: true,
      headlessRefused: true,
      manualFieldsPreserved: true,
      reloads: 1,
      loginLaunches: 1,
      loginClosures: 1,
      statusRecoveryOnly: true,
      authentication: 'unverified',
      providerClicks: 0,
      pageErrors: 0,
      liveProvider: false,
    };
  } catch (error) {
    await captureFailure(page, panel);
    throw error;
  } finally {
    await fixture.close();
  }
};
