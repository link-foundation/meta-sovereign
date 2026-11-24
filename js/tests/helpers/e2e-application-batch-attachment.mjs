import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

const url = 'https://hh.ru/vacancy/123';
const text = 'The reviewed separate batch cover letter.';

export const verifyNativeBatchLetterAttachment = async (
  browser,
  { before = false, screenshots = process.env.E2E_ARTIFACT_DIR, webBundle } = {}
) => {
  const effects = [];
  const fixture = await applicationNativeFixture(browser, {
    instantApplication: true,
    alreadyDelivered: true,
    onApplicationClose: (effect) => effects.push(effect),
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  if (webBundle) {
    await page.route(`${fixture.base}/app.min.js`, (route) =>
      route.fulfill({ path: webBundle, contentType: 'text/javascript' })
    );
  }
  const { batch, button, field, phase } = controls.batch();
  const capture = async (name, target) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await target.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(screenshots, `application-batch-attachment-${name}.png`),
      });
    }
  };
  try {
    await controls.select();
    await panel.locator('[data-application-letter]').fill(text);
    await panel
      .locator('[data-application-confirmation="cover-letter"]')
      .check();
    await field('urls').fill(url);
    await field('maxApplications').fill('1');
    await field('confirmBatch').check();
    await button('start').click();
    if (before) {
      await phase('completed');
      await capture('before', batch);
      assert.equal(
        await button('follow').isEnabled(),
        true,
        'Batch finished and closed the offered letter at its delivery cap'
      );
      return;
    }
    await batch.locator('[data-application-batch-letters]').waitFor();
    await button('follow').click();
    await panel
      .locator('[data-application-letter-attachment="offered"]')
      .waitFor();
    const owned = nativeApplicationForm(browser, url);
    assert.equal(await action('letter-prepare').isDisabled(), true);
    assert.equal(
      await owned
        .locator('[data-qa="responded-success-attach-cover-letter"]')
        .isVisible(),
      true
    );
    await capture('offered', action('letter-prepare'));
    await controls.confirmed('letter-prepare');
    await panel
      .locator('[data-application-letter-attachment="ready"]')
      .waitFor();
    assert.equal(await action('letter-send').isDisabled(), true);
    const nativeLetter = owned.locator(
      '[data-qa="vacancy-response-popup-form-letter-input"]'
    );
    assert.equal(await nativeLetter.inputValue(), text);
    assert.equal(
      await owned.evaluate(() => globalThis.fixtureAttachmentSends),
      0
    );
    await controls.phone();
    await capture('phone', action('letter-send'));
    await page.setViewportSize({ width: 1280, height: 900 });
    await controls.confirmed('letter-send');
    await phase('completed');
    assert(owned.isClosed());
    assert.deepEqual(effects, [
      { url, attempts: 0, entries: 0, letterOpens: 1, letterSends: 1 },
    ]);
    const receipt = batch.locator('[data-application-batch-letters]');
    const confirmed = receipt.locator(
      '[data-application-batch-letter-result="provider-confirmed"]'
    );
    await receipt.locator('summary').click();
    assert.equal(await confirmed.getByRole('link').getAttribute('href'), url);
    await capture('after', confirmed);
    await page.reload();
    await phase('completed');
    await receipt.locator('summary').click();
    await confirmed.waitFor();
    assert.equal(effects.length, 1);
    assert(fixture.records.every((record) => record.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      applicationsSent: 0,
      attachmentSends: 1,
      receiptRecovered: true,
      resourcesClosed: true,
    };
  } finally {
    await fixture.close();
  }
};
