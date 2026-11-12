import { verifyCvTranslationComparison } from './e2e-cv-translation-comparison.mjs';
import { verifyCvTranslationRecovery } from './e2e-cv-translation-recovery.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvTranslationFixture } from '../../../experiments/issue-56/cv-translation-fixture.mjs';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

export const verifyCvTranslation = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const translators = cvTranslationFixture();
  const f = await vacancyBrowserFixture(browser, {
    exports: {
      service: () => ({ cvTranslation: { adapters: translators.adapters } }),
    },
  });
  const { page } = f;
  const panel = page.locator('[data-cv-translation]');
  const text = panel.locator('[data-cv-translation-text]');
  const action = (name) =>
    panel.locator(`[data-cv-translation-action="${name}"]`);
  const result = panel.locator('[data-cv-translation-result]');
  const pendingKey = 'meta-sovereign:cv-translation:jobs';
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('cv-translation', name, work);
    cases++;
  };
  const screenshot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  const compare = async () => {
    const previous = await result.evaluateAll(
      (nodes) => nodes[0]?.getAttribute('data-cv-translation-request') ?? null
    );
    await action('generate').click();
    await page.waitForFunction((previous) => {
      const node = document.querySelector(
        '[data-cv-translation-result="completed"]'
      );
      return (
        node && node.getAttribute('data-cv-translation-request') !== previous
      );
    }, previous);
  };
  try {
    await page.goto(`${f.base}/#/cv`);
    await page.locator('[data-cv-technology-review]').waitFor();
    if (before) {
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({
          path: join(screenshots, 'cv-translation-before.png'),
        });
      }
      assert.equal(
        await panel.count(),
        1,
        'CV must expose explicit translation comparison'
      );
      return;
    }
    await panel.waitFor();
    await verifyCvTranslationComparison({
      run,
      translators,
      page,
      panel,
      text,
      action,
      result,
      pendingKey,
      compare,
      screenshot,
    });
    await verifyCvTranslationRecovery({
      run,
      translators,
      f,
      page,
      panel,
      text,
      action,
      result,
      pendingKey,
      screenshot,
    });
    assert.deepEqual(f.errors, []);
    assert.equal(f.records.length, 0);
    console.log(
      '[cv-translation-evidence]',
      JSON.stringify({
        cases,
        modelCalls: translators.calls.translate.length,
        drained: translators.calls.drained,
        providerSessions: f.records.length,
        errors: f.errors,
      })
    );
  } finally {
    await f.close();
    await translators.service.stop();
  }
};
