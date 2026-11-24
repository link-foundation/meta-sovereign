import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

const letter =
  'Reviewed cover letter for the separately delivered application.';
const attachment = (panel, status) =>
  panel.locator(`[data-application-letter-attachment="${status}"]`);
const nativeCounts = (page) =>
  page.evaluate(() => ({
    applications: globalThis.applicationEntries,
    ordinarySubmissions: globalThis.applicationAttempts,
    popupOpens: globalThis.fixtureAttachmentOpens,
    attachmentSends: globalThis.fixtureAttachmentSends,
  }));
const shot = async (page, target, directory, name) => {
  if (directory) {
    await mkdir(directory, { recursive: true });
    await target.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(directory, `application-letter-attachment-${name}.png`),
    });
  }
};
const enter = async (controls) => {
  const { panel, action } = controls;
  await controls.select();
  await panel.locator('[data-application-letter]').fill(letter);
  await action('start').click();
  await panel.locator('[data-application-state="ready"]').waitFor();
  await controls.confirmed('enter');
  const delivery = panel.locator(
    '[data-application-delivery="provider-confirmed"]'
  );
  await delivery.waitFor();
  return delivery;
};

export const verifyNativeLetterAttachment = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await applicationNativeFixture(browser, {
    instantApplication: true,
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  try {
    const delivery = await enter(controls);
    const owned = nativeApplicationForm(browser, 'https://hh.ru/vacancy/123');
    const offer = owned.locator(
      '[data-qa="responded-success-attach-cover-letter"]'
    );
    assert.equal(await offer.isVisible(), true);
    if (before) {
      await shot(page, delivery, screenshots, 'before');
      assert.equal(
        await action('letter-prepare').count(),
        1,
        'Native cover-letter offer has no panel action'
      );
      return;
    }
    assert.equal(await action('letter-prepare').isDisabled(), true);
    await controls.confirmed('letter-prepare');
    const ready = attachment(panel, 'ready');
    await ready.waitFor();
    const nativeLetter = owned.locator(
      '[data-qa="vacancy-response-popup-form-letter-input"]'
    );
    assert.equal(await nativeLetter.inputValue(), letter);
    const prepared = await nativeCounts(owned);
    assert.deepEqual(prepared, {
      applications: 1,
      ordinarySubmissions: 0,
      popupOpens: 1,
      attachmentSends: 0,
    });
    assert.equal(await action('letter-send').isDisabled(), true);
    await nativeLetter.fill('A different owner draft.');
    await action('read').click();
    await attachment(panel, 'owner-conflict').waitFor();
    assert.equal(await nativeLetter.inputValue(), 'A different owner draft.');
    assert.equal(await action('letter-send').count(), 0);
    assert.deepEqual(await nativeCounts(owned), prepared);
    await nativeLetter.fill(letter);
    await action('read').click();
    await ready.waitFor();
    await shot(page, ready, screenshots, 'ready');
    await controls.locales(
      '[data-application-letter-attachment="ready"]',
      async () => {
        assert.equal(await action('letter-send').isDisabled(), true);
        assert.deepEqual(await nativeCounts(owned), prepared);
      }
    );
    await controls.phone();
    await shot(page, ready, screenshots, 'phone');
    await page.setViewportSize({ width: 1280, height: 900 });
    await controls.confirmed('letter-send');
    const sent = attachment(panel, 'provider-confirmed');
    await sent.waitFor();
    assert.equal(await action('letter-send').count(), 0);
    assert.equal(
      await owned.evaluate(() => globalThis.fixtureAttachedLetter),
      letter
    );
    await shot(page, sent, screenshots, 'after');
    await page.reload();
    await sent.waitFor();
    assert.deepEqual(await nativeCounts(owned), {
      ...prepared,
      attachmentSends: 1,
    });
    await controls.close(owned);
    return {
      entries: 1,
      ordinarySubmissions: 0,
      popupOpens: 1,
      attachmentSends: 1,
      locales: 4,
      resourcesClosed: true,
    };
  } finally {
    await fixture.close();
  }
};
