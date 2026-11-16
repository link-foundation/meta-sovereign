import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { cvPublicationBrowserFixture } from '../../../experiments/issue-56/cv-publication-browser-fixture.mjs';

/** One existing browser, two source types, one local push and no provider session. */
export const verifyNativeExportPublication = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await cvPublicationBrowserFixture(browser, {
    nativeExport: true,
  });
  const { page, publication: f, exported } = fixture;
  const panel = page.locator('[data-cv-save-watch] [data-cv-publication]');
  const source = panel.locator('[data-cv-publication-source]');
  const action = (name) =>
    panel.locator(`[data-cv-publication-action="${name}"]`);
  const state = (name) =>
    panel.locator(`[data-cv-publication-state="${name}"]`).waitFor();
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(screenshots, `${name}.png`) });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await panel.waitFor();
    if (before) {
      assert.equal(await source.count(), 0);
      await shot('before-desktop');
      await page.setViewportSize({ width: 390, height: 950 });
      await shot('before-phone');
      return {
        nativeExportSource: false,
        providerSessions: fixture.records.length,
      };
    }
    await source.waitFor();
    await source.selectOption(
      `${exported.receipt.exportId}:${exported.receipt.hash}`
    );
    await panel
      .locator('[data-cv-publication-field="repository"]')
      .fill(f.repository);
    await action('plan').click();
    await state('planned');
    const consent = panel.locator('[data-cv-publication-consent]');
    await consent.check();
    await source.selectOption('owner');
    // selectOption dispatches change before React's source effect commits.
    await panel
      .locator('[data-cv-publication-consent]:not(:checked)')
      .waitFor();
    assert.equal(await consent.isChecked(), false);
    assert.equal(await action('publish').isDisabled(), true);
    await source.selectOption(
      `${exported.receipt.exportId}:${exported.receipt.hash}`
    );
    await panel
      .locator('[data-cv-publication-consent]:not(:checked)')
      .waitFor();
    assert.equal(await consent.isChecked(), false);
    await panel.locator('details > summary').click();
    assert.doesNotMatch(
      await panel.innerText(),
      /alex@example|private@example|100000 USD|1990-01-01/u
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
    const calls = f.calls.length;
    await f.store.delete('jobs-cv-snapshots:jobs');
    await page.reload();
    await state('published');
    assert.equal(f.calls.length, calls);
    assert.equal(
      await source.inputValue(),
      `${exported.receipt.exportId}:${exported.receipt.hash}`
    );
    assert.equal(await action('publish').isDisabled(), true);
    assert.deepEqual(
      await readFile(path.join(exported.folder, 'resume.json')),
      exported.content
    );
    assert.equal(fixture.records.length, 0);
    assert.deepEqual(fixture.errors, []);
    return {
      nativeExportSource: true,
      localPushes: 1,
      providerSessions: 0,
      locales: 4,
      privateExportPreserved: true,
      recoveryReplayed: false,
    };
  } finally {
    await fixture.close();
  }
};
