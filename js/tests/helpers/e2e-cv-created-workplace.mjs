import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvCreatedWorkplaceBrowserFixture } from '../../../experiments/issue-56/cv-created-workplace-browser-fixture.mjs';
import { cvWorkplaceListHtml } from '../../../experiments/issue-56/cv-created-workplace-fixture.mjs';
import { readCvWorkplaceListDocument } from '../../src/jobs/cv-workplace-created.js';

export const verifyCvWatchCreatedWorkplace = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const f = await cvCreatedWorkplaceBrowserFixture(browser);
  const { page, provider, store, createdCounters: counts } = f;
  const view = page.locator('[data-cv-save-watch]');
  const state = (name) =>
    view.locator(`[data-cv-watch-state="${name}"]`).waitFor();
  const action = (name) =>
    view.locator(`[data-cv-watch-action="${name}"]`).click();
  const capture = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await view.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  const save = async (text) => {
    await provider.locator('textarea').fill(text);
    await provider.locator('[data-qa="profile-layout-save-button"]').click();
  };
  const open = async () => {
    await action('stop');
    await state('stopped');
    await f.reset();
    await action('start');
    await state('watching');
  };
  try {
    await page.goto(`${f.base}/#/cv`);
    await state('none');
    const nativeUrl = provider.url();
    await action('start');
    await state('watching');
    assert.equal(provider.url(), nativeUrl);
    assert.equal(counts.ownerSaves, 0);
    assert.equal(counts.records, 0);
    assert.equal(counts.lists, before ? 0 : 1);
    await save('Owner final new workplace description');
    if (before) {
      await state('not-saved');
      await capture('cv-created-workplace-before');
      assert.equal(
        await view.locator('[data-cv-watch-state="saved"]').count(),
        1,
        'The newly saved native workplace needs exact fresh identity verification'
      );
    }
    await state('saved');
    const previous = await store.get('jobs-cv-snapshots:jobs');
    assert.equal(previous.snapshots[0].workplace.recordId, '987');
    assert.equal(
      previous.snapshots[0].cv.jobs[0].description,
      'Owner final new workplace description'
    );
    assert.equal(previous.snapshots[1].workplace.checked, false);
    assert.equal(
      previous.snapshots[1].cv.jobs[0].company,
      'Unrelated employer retained in the other CV'
    );
    assert.equal(counts.ownerSaves, 1);
    assert.equal(counts.records, 1);
    assert.equal(counts.lists, 2);
    await capture('cv-created-workplace-after');
    for (const mode of ['older', 'ambiguous', 'mismatch']) {
      await open();
      f.mode(mode);
      await save(
        mode === 'older'
          ? 'Original description'
          : `Owner new description ${mode}`
      );
      await state('not-saved');
      assert.deepEqual(await store.get('jobs-cv-snapshots:jobs'), previous);
    }
    await open();
    const saves = counts.ownerSaves;
    await action('stop');
    await state('stopped');
    assert.equal(await provider.locator('textarea').count(), 1);
    assert.equal(counts.ownerSaves, saves);
    assert.deepEqual(await store.get('jobs-cv-snapshots:jobs'), previous);

    assert.deepEqual(
      await provider.evaluate(
        readCvWorkplaceListDocument,
        cvWorkplaceListHtml([])
      ),
      []
    );
    assert.deepEqual(
      await provider.evaluate(
        readCvWorkplaceListDocument,
        cvWorkplaceListHtml(['123', '987'])
      ),
      ['123', '987']
    );
    let refused = 0;
    for (const html of [
      '<main></main>',
      cvWorkplaceListHtml(['123', '123']),
      cvWorkplaceListHtml(['123']).replace(
        '/experience/123"',
        '/experience/123#other"'
      ),
      cvWorkplaceListHtml(['123']).replace(
        'href="/profile/edit/experience/123"',
        'href="https://other.test/profile/edit/experience/123"'
      ),
      `${cvWorkplaceListHtml(['123'])}<a rel="next">More</a>`,
      `${cvWorkplaceListHtml(['123'])}<input name="captcha">`,
      cvWorkplaceListHtml(['123']).replace(
        '</main>',
        '<button>Edit</button></main>'
      ),
      cvWorkplaceListHtml(Array.from({ length: 1001 }, (_, i) => String(i))),
    ]) {
      assert.equal(
        await provider.evaluate(readCvWorkplaceListDocument, html),
        null
      );
      refused++;
    }
    assert.equal(
      await provider.evaluate(
        () => globalThis.inertNewRecordScriptExecuted ?? false
      ),
      false
    );
    assert.deepEqual(f.errors, []);
    return {
      createdRecordVerified: true,
      olderRecordRefused: true,
      ambiguousIdsRefused: true,
      metadataMismatchRefused: true,
      priorSnapshotsRetained: true,
      otherCvRetained: true,
      stopLeavesDraft: true,
      inertListRefusals: refused,
      liveProvider: false,
      ...counts,
    };
  } catch (error) {
    console.error('[cv-created-workplace]', JSON.stringify(counts));
    throw error;
  } finally {
    await f.close();
  }
};
