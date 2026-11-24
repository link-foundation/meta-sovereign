import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applicationSearchAttachmentFixture,
  originalApplicationSearch,
} from '../../../experiments/issue-56/application-search-attachment-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { decodeWire } from '../../src/transport/lino.js';

const vacancy = 'https://hh.ru/vacancy/123';
const letter = 'A reviewed cover letter from the original search.';
const letterInput = '[data-qa="vacancy-response-popup-form-letter-input"]';

export const verifyNativeSearchLetterAttachment = async (
  browser,
  { before = false, screenshots, mode, ownerDraft } = {}
) => {
  const fixture = await applicationSearchAttachmentFixture(browser, {
    mode,
    ownerDraft,
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const attachment = (status) =>
    panel.locator(`[data-application-letter-attachment="${status}"]`);
  const shot = async (name, target) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await target.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  try {
    await controls.select();
    await panel.locator('[data-application-letter]').fill(letter);
    await panel
      .locator('[data-application-option="applyFromVacancyPage"]')
      .uncheck();
    await panel
      .locator('[data-application-option="applicationSearchUrl"]')
      .fill(originalApplicationSearch);
    const opened = page.waitForResponse((response) =>
      response.url().endsWith('/api/vacancies/application-open')
    );
    await action('start').click();
    const response = await opened;
    const value = await decodeWire(
      await response.body(),
      response.headers()['content-type']
    );
    assert.equal(response.status(), 200, JSON.stringify(value));
    assert.equal(value.delivery, 'provider-confirmed', JSON.stringify(value));
    const delivered = panel.locator(
      '[data-application-delivery="provider-confirmed"]'
    );
    await delivered.waitFor().catch(async (error) => {
      throw new Error(
        JSON.stringify({ value, ui: (await panel.innerText()).slice(0, 2200) }),
        { cause: error }
      );
    });
    const owned = nativeApplicationForm(browser, vacancy);
    if (before) {
      await shot('before', delivered);
      assert.equal(
        await action('letter-prepare').count(),
        1,
        'Confirmed vacancy without a page offer has no search-card letter action'
      );
      return;
    }
    await attachment('search').waitFor();
    assert.deepEqual(fixture.searches, []);
    assert.equal(await action('letter-prepare').isDisabled(), true);
    await shot('search', attachment('search'));
    await controls.confirmed('letter-prepare');
    assert.deepEqual(fixture.searches, [originalApplicationSearch]);
    if (mode === 'duplicate') {
      await attachment('needs-review').waitFor();
      assert.equal(await action('letter-send').count(), 0);
      await controls.close(owned);
      return;
    }
    if (ownerDraft) {
      await attachment('owner-conflict').waitFor();
      assert.equal(
        await owned.locator(letterInput).inputValue(),
        'An existing owner letter'
      );
      assert.equal(await action('letter-send').count(), 0);
      await controls.close(owned);
      return;
    }
    await attachment('ready').waitFor();
    assert.equal(
      owned.url(),
      mode === 'fallback' ? vacancy : originalApplicationSearch
    );
    assert.equal(await owned.locator(letterInput).inputValue(), letter);
    if (mode !== 'fallback') {
      assert.deepEqual(await owned.evaluate(() => globalThis.letterOpens), [
        '123',
      ]);
      assert.deepEqual(await owned.evaluate(() => globalThis.letterSends), []);
    }
    await shot('ready', attachment('ready'));
    await controls.confirmed('letter-send');
    const confirmed = attachment('provider-confirmed');
    await confirmed.waitFor();
    if (mode === 'fallback') {
      assert.equal(
        await owned.evaluate(() => globalThis.fixtureAttachmentSends),
        1
      );
    } else {
      assert.deepEqual(await owned.evaluate(() => globalThis.letterSends), [
        { id: '123', text: letter },
      ]);
      assert.equal(
        await owned
          .locator('[data-qa="vacancy-response-letter-toggle"]')
          .count(),
        1
      );
    }
    await page.reload();
    await confirmed.waitFor();
    await shot('after', confirmed);
    await controls.close(owned);
    assert.deepEqual(fixture.errors, []);
    return {
      mode: mode ?? 'search',
      searchNavigations: fixture.searches.length,
      letterSends: 1,
      resourcesClosed: true,
    };
  } finally {
    await fixture.close();
  }
};
