import assert from 'node:assert/strict';
import {
  applicationRecruiterPanelFixture,
  recruiterPanelDraft,
} from '../../../experiments/issue-56/application-recruiter-panel-fixture.mjs';
import { originalApplicationSearch } from '../../../experiments/issue-56/application-search-route-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

const vacancy = 'https://hh.ru/vacancy/123';

export const verifyNativeApplicationRecruiterPanel = async (
  browser,
  {
    before = false,
    screenshots,
    webBundle,
    panelDelayMs = 4000,
    manualSend = false,
  } = {}
) => {
  const fixture = await applicationRecruiterPanelFixture(browser, {
    panelDelayMs,
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel } = controls;
  const { batch, button, field, phase } = controls.batch();
  const shot = controls.screenshot(screenshots, 'application-recruiter-panel');
  if (webBundle) {
    await page.route(`${fixture.base}/app.min.js`, (route) =>
      route.fulfill({ path: webBundle, contentType: 'text/javascript' })
    );
  }
  try {
    await controls.select();
    await panel
      .locator('[data-application-option="applyFromVacancyPage"]')
      .uncheck();
    await panel
      .locator('[data-application-option="applicationSearchUrl"]')
      .fill(originalApplicationSearch);
    await panel
      .locator('[data-application-option="vacancyPreviewSeconds"]')
      .fill('0');
    await field('urls').fill(vacancy);
    await field('maxApplications').fill('1');
    await field('confirmBatch').check();
    await button('start').click();
    await phase('review');
    await button('follow').click();
    await panel.locator('[data-application-state="review"]').waitFor();
    const owned = nativeApplicationForm(browser);
    assert(owned);
    if (manualSend) {
      await owned.getByRole('button', { name: 'Send application' }).click();
    } else {
      await controls.confirmed('submit');
    }
    if (before) {
      await phase('completed');
      await shot('before', batch);
      assert.equal(
        owned.isClosed(),
        false,
        'The batch closed the returned search before the recruiter panel could be reviewed'
      );
    }
    const status = panel.locator('[data-application-recruiter-chat="open"]');
    const receipt = panel.locator(
      '[data-application-delivery="provider-confirmed"]'
    );
    const nativePanel = owned.locator('[data-qa="chatik-root"]');
    const draft = nativePanel
      .locator('iframe')
      .contentFrame()
      .getByRole('textbox', { name: 'Your reply' });
    await draft.waitFor();
    await status.waitFor();
    await receipt.waitFor();
    await phase('review');
    assert.equal(owned.url(), originalApplicationSearch);
    assert.deepEqual(fixture.searchVisits, [
      originalApplicationSearch,
      originalApplicationSearch,
    ]);
    assert.equal(
      await owned.evaluate(() =>
        globalThis.sessionStorage.getItem('fixture-application-sends')
      ),
      '1'
    );
    assert.equal(await draft.inputValue(), recruiterPanelDraft);
    assert.equal(fixture.effects.length, 0);
    await shot('desktop', status.locator('..'));
    await shot('native', nativePanel);
    await controls.phone();
    await page.reload();
    await phase('review');
    await button('follow').click();
    await status.waitFor();
    await receipt.waitFor();
    assert.equal(await draft.inputValue(), recruiterPanelDraft);
    await shot('phone', status.locator('..'));
    await nativePanel
      .getByRole('button', { name: 'Close recruiter panel' })
      .click();
    await phase('completed');
    assert.equal(owned.isClosed(), true);
    assert.equal(fixture.effects.length, 1);
    assert.equal(fixture.searchVisits.length, 2);
    assert(fixture.records.every((record) => record.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      applicationsSent: 1,
      manualSend,
      exactSearchVisits: 2,
      draftPreserved: true,
      batchCompletedAfterOwnerDismissal: true,
      resourcesClosed: true,
    };
  } finally {
    await fixture.close();
  }
};
