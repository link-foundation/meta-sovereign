import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cvPublicationBrowserFixture } from '../../../experiments/issue-56/cv-publication-browser-fixture.mjs';
import { storedExperienceDocument } from '../../src/cv/experience-store.js';

/** One finite local Git push, two private sources and no provider sessions. */
export const verifyExperiencePublication = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await cvPublicationBrowserFixture(browser, {
    experienceDocuments: true,
  });
  const { page, publication: f, experiences } = fixture;
  const documents = page.locator('[data-experience-documents]');
  const panel = documents.locator('[data-experience-publication]');
  const action = (name) =>
    panel.locator(`[data-cv-publication-action="${name}"]`);
  const state = (name) =>
    panel.locator(`[data-cv-publication-state="${name}"]`).waitFor();
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await (before ? documents : panel).evaluate((element) => {
        element.scrollIntoView({ block: 'start' });
        globalThis.scrollBy(0, -70);
      });
      await page.screenshot({ path: path.join(screenshots, `${name}.png`) });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await documents.locator(':scope > summary').click();
    if (before) {
      assert.equal(await panel.count(), 0);
      await shot('before-desktop');
      await page.setViewportSize({ width: 390, height: 950 });
      await shot('before-phone');
      return {
        experiencePublication: false,
        providerSessions: fixture.records.length,
      };
    }
    const source = panel.locator('[data-cv-publication-source]');
    await source.waitFor();
    const select = (index) =>
      source.selectOption(`experience:${experiences[index].revision}`);
    await select(0);
    await panel
      .locator('[data-cv-publication-field="repository"]')
      .fill(f.repository);
    await action('plan').click();
    await state('planned');
    const consent = panel.locator('[data-cv-publication-consent]');
    await consent.check();
    await select(1);
    await panel
      .locator('[data-cv-publication-consent]:not(:checked)')
      .waitFor();
    assert.equal(await action('publish').isDisabled(), true);
    await select(0);
    await panel.locator('details > summary').click();
    assert.doesNotMatch(
      await panel.innerText(),
      /private@example|1990-01-01|100000 USD|unknownFuture|Original media/u
    );
    await shot('review-desktop');
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page
        .locator('[data-action="language-switcher"] select')
        .selectOption(locale);
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.doesNotMatch(await panel.innerText(), /cvPublish\.[a-z]/u);
    }
    await page.setViewportSize({ width: 390, height: 950 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > globalThis.innerWidth
      ),
      false
    );
    await shot('review-phone');
    await consent.check();
    await action('publish').click();
    await state('published');
    await shot('published-phone');
    const count = f.calls.length;
    await page.reload();
    await documents.locator(':scope > summary').click();
    await state('published');
    assert.equal(f.calls.length, count);
    assert.equal(
      await source.inputValue(),
      `experience:${experiences[0].revision}`
    );
    assert.equal(await consent.isChecked(), false);
    assert.equal(await action('publish').isDisabled(), true);
    for (const item of experiences) {
      assert.deepEqual(
        (await storedExperienceDocument(f.store, item.revision)).document,
        item.document
      );
    }
    assert.equal(f.calls.filter((args) => args.includes('push')).length, 1);
    assert.equal(fixture.records.length, 0);
    assert.deepEqual(fixture.errors, []);
    return {
      experiencePublication: true,
      locales: 4,
      privateOriginalsPreserved: 2,
      localPushes: 1,
      recoveryReplayed: false,
      providerSessions: 0,
    };
  } finally {
    await fixture.close();
  }
};
