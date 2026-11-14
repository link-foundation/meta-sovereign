import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cvWorkplaceBrowserFixture } from '../../../experiments/issue-56/cv-workplace-browser-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';
import {
  verifyCvWorkplaceReadbackDocument,
  verifyCvWorkplaceRecovery,
} from './e2e-cv-workplace-readback.mjs';

export const verifyCvWatchWorkplace = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await cvWorkplaceBrowserFixture(browser);
  const { page, provider, store } = fixture;
  const view = page.locator('[data-cv-save-watch]');
  const status = (name) =>
    view.locator(`[data-cv-watch-state="${name}"]`).waitFor();
  const { url, modes } = fixture;
  const capture = async (name, target = view) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: path.join(screenshots, name) });
    }
  };
  try {
    await provider.goto(url);
    await verifyCvWorkplaceReadbackDocument(provider, url);
    await page.goto(`${fixture.base}/#/cv`);
    await status('none');
    await view.locator('[data-cv-watch-action="start"]').click();
    await status('watching');
    await traceBrowserScenario(
      'cv-save-watch',
      'trusted workplace Save verifies the exact record and excludes it from a CV with unrelated work history',
      async () => {
        await provider
          .locator('textarea')
          .fill('Final owner workplace description');
        await provider
          .locator('[data-qa="profile-layout-save-button"]')
          .click();
        if (before) {
          await status('not-saved');
          await capture('cv-workplace-identity-before.png');
          assert.equal(
            await view.locator('[data-cv-watch-state="saved"]').count(),
            1,
            'The exact record must be confirmed without removing unrelated CV jobs'
          );
        }
        await status('saved');
        const saved = (await store.get('jobs-cv-snapshots:jobs')).snapshots[0];
        assert.equal(
          saved.cv.jobs[0].description,
          'Final owner workplace description'
        );
        assert.equal(saved.cv.jobs[0].start, '2020-05');
        assert.equal(saved.cv.jobs[0].industries[0].id, '7.540');
        const snapshots = (await store.get('jobs-cv-snapshots:jobs')).snapshots;
        assert.equal(snapshots.length, 2);
        assert.equal(
          snapshots[1].cv.jobs[0].company,
          'Unrelated employer retained in the other CV'
        );
        assert.equal(snapshots[1].workplace.checked, false);
        assert.equal(saved.workplace.recordId, '123');
        assert.match(saved.workplace.sha256, /^[a-f\d]{64}$/u);
        assert.equal(
          await provider.evaluate(
            () => globalThis.inertRecordScriptExecuted ?? false
          ),
          false
        );
        const reads = fixture.counts().recordReads;
        await verifyCvWorkplaceRecovery({ page, view, status, capture });
        assert.equal(fixture.counts().recordReads, reads);
      }
    );
    await traceBrowserScenario(
      'cv-save-watch',
      'a saved company metadata mismatch retains the earlier verified workplace snapshot',
      async () => {
        const previous = (await store.get('jobs-cv-snapshots:jobs'))
          .snapshots[0].sha256;
        modes.mismatch = true;
        await provider.goto(url);
        await provider
          .locator('textarea')
          .fill('Later mismatched owner description');
        await provider
          .locator('[data-qa="profile-layout-save-button"]')
          .click();
        await status('not-saved');
        assert.equal(
          (await store.get('jobs-cv-snapshots:jobs')).snapshots[0].sha256,
          previous
        );
      }
    );
    for (const mode of ['membership', 'challenge']) {
      await traceBrowserScenario(
        'cv-save-watch',
        `${mode} readback failure preserves earlier record evidence`,
        async () => {
          modes.mismatch = false;
          modes.membershipMismatch = mode === 'membership';
          modes.challenge = mode === 'challenge';
          const previous = await store.get('jobs-cv-snapshots:jobs');
          await provider.goto(url);
          await provider.locator('textarea').fill(`Owner revision ${mode}`);
          await status('edited');
          await provider
            .locator('[data-qa="profile-layout-save-button"]')
            .click();
          await status('not-saved');
          assert.deepEqual(await store.get('jobs-cv-snapshots:jobs'), previous);
          assert.equal(
            await provider.evaluate(
              () => globalThis.inertRecordScriptExecuted ?? false
            ),
            false
          );
        }
      );
    }
    const { ownerSaves, recordNavigations, recordReads } = fixture.counts();
    assert.equal(ownerSaves, 4);
    assert.equal(recordNavigations, 4);
    assert.ok(recordReads >= 4 && recordReads <= 20);
    assert.deepEqual(fixture.errors, []);
    return {
      cases: 4,
      verifiedWorkplace: true,
      mismatchRetained: true,
      recordReads,
      recordNavigations,
      ownerSaves,
      inertScriptsExecuted: false,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
