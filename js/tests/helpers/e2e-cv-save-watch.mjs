import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cvSaveWatchBrowserFixture } from '../../../experiments/issue-56/cv-watch-browser-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';
import { assertNextControl } from './e2e-keyboard-controls.mjs';
import { assertCvWatchLayout } from './e2e-cv-watch-layout.mjs';
import { recoverCvWatchStart } from './e2e-cv-watch-recovery.mjs';
import { stopCvWatchWithLateRead } from './e2e-cv-watch-read-order.mjs';

export const verifyCvSaveWatch = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await cvSaveWatchBrowserFixture(browser);
  const { page, provider, counters } = fixture;
  const view = page.locator('[data-cv-save-watch]');
  const action = (name) => view.locator(`[data-cv-watch-action="${name}"]`);
  const state = (name) =>
    view.locator(`[data-cv-watch-state="${name}"]`).waitFor();
  const screenshot = async (name, target = page) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      if (target === page && !before) {
        await view.scrollIntoViewIfNeeded();
      }
      await target.screenshot({ path: path.join(screenshots, `${name}.png`) });
    }
  };
  let cases = 0;
  const run = (name, work) =>
    traceBrowserScenario('cv-save-watch', name, async () => {
      await work();
      cases++;
    });
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-vacancies]').waitFor();
    if (before) {
      await page.locator('[data-resume-exports]').scrollIntoViewIfNeeded();
      await screenshot('cv-save-watch-before');
      assert.equal(
        await view.count(),
        1,
        'CV surface must expose passive owner-save observation'
      );
      return;
    }
    await run(
      'start observes the existing unsaved native tab without input, clicks or navigation',
      async () => {
        await state('none');
        const url = provider.url();
        await recoverCvWatchStart(page, view);
        assert.equal(counters.attachments, 1);
        assert.equal(provider.url(), url);
        assert.deepEqual(
          await provider.evaluate(() => [
            globalThis.ownerClicks,
            globalThis.ownerInputs,
          ]),
          [0, 0]
        );
        await provider.locator('[role="dialog"] button').click();
        await state('watching');
        assert.equal(counters.reads, 0);
        await provider.evaluate(() =>
          document
            .querySelector('[data-qa="resume-partial-edit-save"]')
            .dispatchEvent(
              new globalThis.MouseEvent('click', { bubbles: true })
            )
        );
        // The fixture's onclick still executes; an untrusted click must not create a watch attempt.
        await provider.waitForURL('**/resume/abc123?*');
        await state('watching');
        assert.equal(counters.reads, 0);
        await fixture.openEditor();
      }
    );
    await run(
      'final owner edits at trusted Save are independently read back and sanitized before publication',
      async () => {
        await provider
          .locator('textarea')
          .fill('Owner final revision\nContact private@example.test');
        await screenshot('cv-save-watch-owner-final', provider);
        await provider.locator('[data-qa="resume-partial-edit-save"]').click();
        await state('saved');
        assert.equal(counters.reads, 1);
        await view.locator('[data-cv-saved-snapshot] > summary').click();
        assert.match(await view.textContent(), /Owner final revision/u);
        assert.equal(
          (await view.textContent()).includes('private@example.test'),
          false
        );
        assert.equal(
          await provider.evaluate(
            () => globalThis.nativeExportScriptExecuted ?? false
          ),
          false
        );
        await screenshot('cv-save-watch-desktop');
      }
    );
    await run(
      'cancel and provider validation failure retain the previous saved snapshot',
      async () => {
        const old = (await fixture.store.get('jobs-cv-snapshots:jobs'))
          .snapshots[0].sha256;
        await fixture.openEditor();
        await provider.locator('textarea').fill('Cancelled change');
        await provider
          .locator('[data-qa="resume-partial-edit-cancel"]')
          .click();
        await state('cancelled');
        await fixture.openEditor();
        fixture.mode('validation');
        await provider.locator('textarea').fill('Invalid change');
        await provider.locator('[data-qa="resume-partial-edit-save"]').click();
        await state('not-saved');
        assert.equal(
          (await fixture.store.get('jobs-cv-snapshots:jobs')).snapshots[0]
            .sha256,
          old
        );
        assert.equal(counters.reads, 1);
      }
    );
    await run(
      'phone reload recovers active state by GET and Stop leaves the native draft open',
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await state('not-saved');
        assert.equal(counters.attachments, 1);
        await assertNextControl(page, action('stop'), action('reload'));
        await assertCvWatchLayout(page, screenshot);
        const url = provider.url();
        await stopCvWatchWithLateRead(page, view);
        assert.equal(provider.url(), url);
        assert.equal(
          await provider.locator('textarea').inputValue(),
          'Invalid change'
        );
        assert.equal(counters.detached, 1);
        await screenshot('cv-save-watch-phone');
        assert.deepEqual(fixture.errors, []);
      }
    );
    return { cases, ...counters };
  } finally {
    await fixture.close();
  }
};
