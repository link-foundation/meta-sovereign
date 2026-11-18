import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

export const verifyNativeApplicationBatch = async (
  browser,
  { before = false, screenshots = process.env.E2E_ARTIFACT_DIR } = {}
) => {
  const effects = [];
  const fixture = await applicationNativeFixture(browser, {
    vacancyIds: ['123', '456'],
    onApplicationClose: (effect) => effects.push(effect),
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  // A batch crosses several documents, each with commander URL stabilization.
  // Bound those transitions separately from individual UI interactions.
  const { batch, field, button, phase } = controls.batch();
  const shot = controls.screenshot(screenshots, 'application-batch');
  try {
    await controls.select();
    if (before) {
      await shot('before');
      assert.equal(
        await batch.count(),
        1,
        'finite paced batch controls are absent'
      );
      return;
    }
    await startBatch(panel, field, button);
    await phase('questionnaires-held');
    await shot('held');
    assert.equal(effects.filter((row) => row.entries).length, 0);
    assert.equal(
      effects.reduce((sum, row) => sum + row.attempts, 0),
      0
    );
    await field('batchQuestionnaires').click();
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '[data-application-batch-field="batchQuestionnaires"]'
        ).checked
    );
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-application-batch-action="follow"]')
          .disabled
    );
    await button('follow').click();
    await panel.locator('[data-application-continuation="send"]').waitFor();
    let owned = nativeApplicationForm(browser);
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Five years building Python services.'
    );
    assert.equal(await action('confirm-step').isDisabled(), true);
    await shot('review');
    await controls.locales('[data-application-continuation="send"]');
    await controls.phone();
    await shot('phone');
    await controls.confirmed('confirm-step');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-application-batch-current]')
          ?.textContent === 'https://hh.ru/vacancy/456'
    );
    await action('recover').click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-application-action="release"]').disabled
    );
    await action('release').click();
    await button('follow').click();
    await panel.locator('[data-application-continuation="send"]').waitFor();
    owned = nativeApplicationForm(
      browser,
      'https://hh.ru/applicant/vacancy_response?vacancyId=456&startedWithQuestion=false'
    );
    assert(owned);
    await owned.locator('[data-qa="vacancy-response-letter-submit"]').click();
    await phase('completed');
    await shot('complete');
    assert.equal(
      effects.reduce((sum, row) => sum + row.attempts, 0),
      2
    );
    assert.equal(
      effects.reduce((sum, row) => sum + row.entries, 0),
      0
    );
    assert.equal(
      fixture.records.every((record) => record.closed),
      true
    );
    assert.deepEqual(fixture.errors, []);
    await page.reload();
    await phase('completed');
    assert.equal(
      effects.reduce((sum, row) => sum + row.attempts, 0),
      2
    );
    return {
      deliveries: 2,
      manualDeliveries: 1,
      queueRevisits: 2,
      entryClicks: 0,
      locales: 4,
      phone: true,
      reloadReplayed: false,
      resourcesClosed: true,
    };
  } catch (error) {
    await shot('failed').catch(() => {});
    console.log(
      'Application panel at refusal',
      await panel.innerText().catch(() => 'missing')
    );
    console.log('Native errors', fixture.errors);
    console.log(
      'Native documents',
      browser
        .contexts()
        .flatMap((context) => context.pages().map((native) => native.url()))
    );
    throw error;
  } finally {
    await fixture.close();
  }
};

const startBatch = async (panel, field, button) => {
  await panel.locator('[data-application-option="pacing"]').check();
  await panel.locator('[data-application-pacing-interval]').fill('2');
  await field('urls').fill(
    'https://hh.ru/vacancy/123\nhttps://hh.ru/vacancy/456'
  );
  await field('noQuestionnaires').check();
  await field('confirmBatch').check();
  await button('start').click();
};
