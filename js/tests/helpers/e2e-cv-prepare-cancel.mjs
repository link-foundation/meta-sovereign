import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvPrepareBrowserFixture } from '../../../experiments/issue-56/cv-prepare-browser-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';
import { requestBody } from './http-wire.mjs';
import { wirePost } from './vacancy-routes.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';

export const verifyCvPreparationCancellation = async (
  browser,
  { before = false, screenshots } = {}
) => {
  let failFlush = false;
  const f = await cvPrepareBrowserFixture(browser, {
    flush: async () => {
      if (failFlush) {
        throw new Error('fixture disk unavailable');
      }
    },
  });
  const { page, provider } = f;
  const panel = page.locator('[data-cv-preparation]');
  const prepare = panel.locator('[data-cv-prepare-change="en:about"]');
  const cancel = panel.locator('[data-cv-prepare-cancel]');
  const reload = panel.locator('[data-cv-prepare-reload]');
  const ready = () =>
    page.waitForFunction(
      () =>
        document.querySelector('[data-cv-prepare-change="en:about"]')
          ?.disabled === false
    );
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('cv-prepare-cancel', name, work);
    cases++;
  };
  let original;
  let preparationPosts = 0;
  try {
    await page.goto(`${f.base}/#/cv`);
    await ready();
    await page.route('**/api/vacancies/cv-prepare', (route) => {
      preparationPosts++;
      original = requestBody(route.request());
      return route.abort('failed');
    });
    await prepare.click();
    await page.locator('[data-vacancy-error]').waitFor();
    await page.unroute('**/api/vacancies/cv-prepare');
    await reload.click();
    assert.equal(await prepare.isDisabled(), true);
    if (before) {
      await shot('cv-prepare-cancel-before');
      assert.equal(
        await cancel.count(),
        1,
        'An unreceived preparation must have explicit ID-specific cancellation'
      );
      return;
    }
    await run(
      'unreceived preparation retains its ID across GET-null and reload',
      async () => {
        await page.reload();
        await cancel.waitFor();
        assert.equal(await prepare.isDisabled(), true);
        assert.ok((await panel.textContent()).includes(original.requestId));
        assert.equal(preparationPosts, 1);
        assert.equal(f.counters.attached, 0);
        await shot('cv-prepare-cancel-pending');
      }
    );
    await run(
      'failed cancellation durability retains the pending intent and blocks replacement',
      async () => {
        failFlush = true;
        await cancel.click();
        await page.locator('[data-vacancy-error]').waitFor();
        assert.equal(await prepare.isDisabled(), true);
        assert.equal(
          await page.locator('[data-cv-prepare-cancelled]').count(),
          0
        );
        assert.equal(
          await page.evaluate(() =>
            globalThis.localStorage.getItem(
              'meta-sovereign:cv-preparation:jobs'
            )
          ),
          original.requestId
        );
        failFlush = false;
        await reload.click();
        assert.equal(await prepare.isDisabled(), true);
      }
    );
    const cancellations = await verifyCancellationReceipt({
      run,
      f,
      page,
      provider,
      panel,
      prepare,
      reload,
      ready,
      cancel,
      original,
      shot,
    });
    assert.deepEqual(f.errors, []);
    assert.equal(f.records.length, 0);
    console.log(
      '[cv-prepare-cancel-evidence]',
      JSON.stringify({
        cases,
        preparationPosts,
        cancellations,
        ...f.counters,
        saves: 0,
        nativeCancels: 0,
        errors: f.errors,
      })
    );
  } finally {
    failFlush = false;
    await f.close();
  }
};

const verifyCancellationReceipt = async ({
  run,
  f,
  page,
  provider,
  panel,
  prepare,
  reload,
  ready,
  cancel,
  original,
  shot,
}) => {
  let cancellations = 0;
  await run(
    'lost cancellation acknowledgement recovers by GET and blocks late copies on desktop and phone',
    async () => {
      await page.route('**/api/vacancies/cv-prepare-cancel', async (route) => {
        cancellations++;
        await route.fetch();
        await route.abort('failed');
      });
      await cancel.click();
      await page.locator('[data-vacancy-error]').waitFor();
      assert.equal(await prepare.isDisabled(), true);
      await page.unroute('**/api/vacancies/cv-prepare-cancel');
      await reload.click();
      await panel
        .locator(`[data-cv-prepare-cancelled="${original.requestId}"]`)
        .waitFor();
      await ready();
      assert.equal(
        await page.evaluate(() =>
          globalThis.localStorage.getItem('meta-sovereign:cv-preparation:jobs')
        ),
        null
      );
      await shot('cv-prepare-cancel-desktop');
      const late = await wirePost(f.base, 'cv-prepare', original, LINO_TEXT);
      assert.equal(late.status, 200);
      assert.equal(late.value.preparation.requestId, original.requestId);
      assert.equal(f.counters.attached, 0);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await panel.locator('[data-cv-prepare-cancelled]').count(),
        1
      );
      await shot('cv-prepare-cancel-phone');
      await reload.focus();
      await page.keyboard.press('Enter');
      await ready();
      await page.reload();
      await ready();
      await panel
        .locator(`[data-cv-prepare-cancelled="${original.requestId}"]`)
        .waitFor();
      assert.equal(cancellations, 1);
      assert.ok(
        await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
      );
    }
  );
  await run(
    'a new explicit preparation succeeds and cancelling its ID never undoes the native draft',
    async () => {
      await page.reload();
      await ready();
      await prepare.click();
      const result = panel.locator('[data-cv-preparation-state="prepared"]');
      await result.waitFor();
      const requestId = await result.getAttribute(
        'data-cv-preparation-request'
      );
      assert.notEqual(requestId, original.requestId);
      const issued = await wirePost(
        f.base,
        'cv-prepare-cancel',
        { requestId, browserSlot: 'jobs' },
        LINO_TEXT
      );
      assert.equal(issued.value.preparation.state, 'prepared');
      assert.equal(
        await provider.locator('textarea').inputValue(),
        f.change.after
      );
      assert.equal(await provider.evaluate(() => globalThis.fixtureCancels), 0);
      assert.equal(await provider.evaluate(() => globalThis.fixtureSaves), 0);
      assert.deepEqual(f.counters, {
        attached: 1,
        detached: 1,
        navigations: 1,
      });
    }
  );
  return cancellations;
};
