import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { changeResumeVisibilityWarning } from '../../../experiments/issue-56/application-resume-visibility-dom.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import {
  nativeApplicationForm,
  nativeApplicationReviewRequest,
} from './application-native-request.mjs';
import {
  applicationDocument,
  applicationSelectors,
} from '../../src/jobs/application-page.js';
import { applicationResult } from '../../src/jobs/application-result.js';
import { LINO_BINARY } from '../../src/transport/lino.js';
import { wirePost } from './vacancy-routes.mjs';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';

const warningRefusesSynchronousSend = async (owned, url) => {
  const handle = await owned.$(applicationSelectors.submit);
  try {
    const snapshot = await handle.evaluate(applicationDocument, {
      url,
      selectors: applicationSelectors,
    });
    assert.equal(snapshot.resumeNotVisible, true);
    const result = await handle.evaluate(applicationDocument, {
      url,
      selectors: applicationSelectors,
      action: 'submit',
      guard: JSON.stringify(snapshot),
    });
    assert.equal(result.dispatched, false);
  } finally {
    await handle.dispose();
  }
};

export const verifyNativeResumeVisibility = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await applicationNativeFixture(browser);
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const shot = controls.screenshot(screenshots, 'resume-visibility');
  const hiddenKinds = [
    'collapsed',
    'hidden',
    'aria-hidden',
    'inert',
    'display-none',
    'visibility-hidden',
    'empty',
    'unrelated',
    'outside',
    'script',
  ];
  try {
    await controls.select();
    await panel.locator('[data-application-option="autoExact"]').check();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const owned = nativeApplicationForm(browser);
    await owned.locator('#experience').fill('Owner answer remains private.');
    for (const kind of hiddenKinds) {
      await owned.evaluate(changeResumeVisibilityWarning, kind);
      await controls.confirmed('read');
      assert.equal(
        await panel.locator('[data-application-state="review"]').count(),
        1,
        kind
      );
      assert.equal(
        await panel.locator('[data-application-hold]').count(),
        0,
        kind
      );
    }
    await owned.evaluate(changeResumeVisibilityWarning, 'visible');
    await controls.confirmed('read');
    if (before) {
      await shot('before');
    }
    assert.equal(
      await panel
        .locator('[data-application-state="resume-not-visible"]')
        .count(),
      1,
      'rendered résumé warning must block the shared application panel'
    );
    await controls.confirm();
    assert.equal(await action('submit').isDisabled(), true);
    assert.equal(await action('prefill').isDisabled(), true);
    await shot('after');
    await controls.phone();
    await shot('phone');
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const kind of ['visible', 'english', 'russian', 'localized']) {
      await owned.evaluate(changeResumeVisibilityWarning, kind);
      await controls.confirmed('read');
      await warningRefusesSynchronousSend(owned, applicationInput.url);
      assert.equal(
        await owned.evaluate(() => globalThis.applicationAttempts),
        0
      );
    }
    await controls.locales('[data-application-state="resume-not-visible"]');
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Owner answer remains private.'
    );
    assert.equal(await owned.locator('#header').inputValue(), 'Owner header');
    await owned.evaluate(changeResumeVisibilityWarning, 'clear');
    await controls.confirmed('read');
    await panel.locator('[data-application-state="review"]').waitFor();
    await panel
      .locator('[data-application-hold="resume-not-visible"]')
      .waitFor();
    await controls.confirmed('prefill');
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Owner answer remains private.'
    );
    await controls.close(owned);
    return {
      hiddenVariants: hiddenKinds.length,
      visibleVariants: 4,
      synchronousRefusals: 4,
      dismissalDoesNotSend: true,
      ownerPreserved: true,
      providerSubmissions: 0,
      browsersClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};

export const verifyPopupResumeVisibility = async (browser) => {
  const fixture = await applicationNativeFixture(browser, { popup: true });
  const request = (operation, receipt, extra) =>
    nativeApplicationReviewRequest(fixture, operation, receipt, extra);
  try {
    let receipt = await request('open');
    receipt = await request('advance', receipt, {
      action: 'enter',
      confirm: true,
    });
    const owned = nativeApplicationForm(browser, applicationInput.url);
    await owned.evaluate(changeResumeVisibilityWarning, 'outside');
    receipt = await request('read', receipt);
    assert.equal(receipt.state, 'review');
    await owned.evaluate(changeResumeVisibilityWarning, 'collapsed');
    receipt = await request('read', receipt);
    assert.equal(receipt.page.resumeNotVisible, false);
    await owned.evaluate(changeResumeVisibilityWarning, 'visible');
    const binary = await wirePost(
      fixture.base,
      'application-read',
      {
        ...applicationInput,
        revision: receipt.revision,
      },
      LINO_BINARY
    );
    assert.equal(binary.status, 200);
    receipt = applicationResult(binary.value, applicationInput);
    assert.equal(receipt.state, 'resume-not-visible');
    assert.equal(receipt.hold, 'resume-not-visible');
    await warningRefusesSynchronousSend(owned, applicationInput.url);
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await request('close', receipt);
    assert(fixture.records.every((row) => row.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      popupBound: true,
      binaryLino: true,
      providerSubmissions: 0,
      browsersClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
