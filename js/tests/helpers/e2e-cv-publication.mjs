import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cvPublicationBrowserFixture } from '../../../experiments/issue-56/cv-publication-browser-fixture.mjs';
import { assertNextControl } from './e2e-keyboard-controls.mjs';

const verifyLocalesAndPhoneFit = async (page, panel) => {
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
};

const verifyReadOnlyReload = async (page, fixture, state, expected) => {
  const calls = fixture.calls.length;
  await page.reload();
  await state(expected);
  assert.equal(fixture.calls.length, calls);
};

export const verifyCvSnapshotPublication = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await cvPublicationBrowserFixture(browser);
  const { page, publication: f } = fixture;
  const panel = page.locator('[data-cv-save-watch] [data-cv-publication]');
  const action = (name) =>
    panel.locator(`[data-cv-publication-action="${name}"]`);
  const field = (name) =>
    panel.locator(`[data-cv-publication-field="${name}"]`);
  const state = (name) =>
    panel.locator(`[data-cv-publication-state="${name}"]`).waitFor();
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await (
        before ? page.locator('[data-cv-save-watch]') : panel
      ).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(screenshots, `${name}.png`) });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-cv-saved-snapshot]').waitFor();
    if (before) {
      assert.equal(await panel.count(), 0);
      await shot('before-desktop');
      await page.setViewportSize({ width: 390, height: 950 });
      await shot('before-phone');
      return {
        publicationControls: false,
        providerSessions: fixture.records.length,
      };
    }
    await state('none');
    const index = (await f.command(['diff', '--cached', '--binary'])).stdout;
    await field('repository').fill(f.repository);
    await action('plan').click();
    await state('planned');
    const consent = panel.locator('[data-cv-publication-consent]');
    assert.equal(await action('publish').isDisabled(), true);
    await panel.locator('details > summary').click();
    assert.equal(
      (await panel.innerText()).includes('private@example.test'),
      false
    );
    await shot('review-desktop');
    await consent.check();
    await field('directory').fill('other-snapshots');
    assert.equal(await consent.isChecked(), false);
    assert.equal(await action('publish').isDisabled(), true);
    await field('directory').fill('examples/cv-snapshots');
    await page.reload();
    await state('planned');
    assert.equal(await consent.isChecked(), false);
    await verifyLocalesAndPhoneFit(page, panel);
    await assertNextControl(page, action('plan'), action('reload'));
    await shot('review-phone');
    await consent.check();
    await action('publish').click();
    await state('published');
    assert.equal(
      (await f.command(['diff', '--cached', '--binary'])).stdout,
      index
    );
    await shot('published-phone');
    await verifyReadOnlyReload(page, f, state, 'published');
    const raw = await f.store.get('jobs-cv-snapshots:jobs');
    await f.store.put({
      ...raw,
      snapshots: [
        {
          ...raw.snapshots[0],
          cv: { ...raw.snapshots[0].cv, about: 'Second saved revision' },
          sha256: 'b'.repeat(64),
          savedAt: '2026-11-14T20:01:00.000Z',
        },
      ],
    });
    await page.locator('[data-cv-watch-action="reload"]').click();
    await action('plan').click();
    await state('planned');
    fixture.loseReceipt();
    await consent.check();
    await action('publish').click();
    await state('uncertain');
    assert.equal(await action('publish').isDisabled(), true);
    await shot('uncertain-phone');
    await verifyReadOnlyReload(page, f, state, 'uncertain');
    assert.equal(fixture.records.length, 0);
    assert.deepEqual(fixture.errors, []);
    return {
      localSnapshotPushes: 2,
      providerSessions: 0,
      locales: 4,
      privateIndexPreserved: true,
      recoveryReplayed: false,
    };
  } finally {
    await fixture.close();
  }
};
