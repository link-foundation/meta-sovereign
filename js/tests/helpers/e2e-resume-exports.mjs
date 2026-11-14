import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';
import { resumeExportProvider } from '../../../experiments/issue-56/resume-export-provider.mjs';
import { resumeCvFromLino } from '../../src/jobs/resume-cv.js';
import { LINO_TEXT, encodeWire, decodeWire } from '../../src/transport/lino.js';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

const verifyLatestExport = async ({
  view,
  action,
  terminal,
  fixture,
  records,
  provider,
  shot,
  run,
}) => {
  await run(
    'latest export streams all native formats with owned cookies and sanitizes bilingual-capable CV files',
    async () => {
      await view.waitFor();
      await view.locator('[data-resume-export-format="doc"]').check();
      await action('start').click();
      await terminal('completed');
      const result = (
        await fixture.store.query((row) =>
          row.id?.startsWith('jobs-resume-export:')
        )
      )[0];
      assert.equal(result.hash, 'english');
      assert.equal(result.language, 'en');
      assert.equal(result.files.length, 8);
      assert.equal(records.length, 1);
      assert.equal(records[0].closed, true);
      assert.equal(result.sanitization.removedLines, 5);
      const contents = [];
      for (const file of result.files.filter((file) => !file.native)) {
        contents.push(
          await readFile(
            join(
              provider.artifactRoot,
              result.exportId,
              result.hash,
              file.name
            ),
            'utf8'
          )
        );
      }
      assert.ok(
        contents.every(
          (content) =>
            !/alex@example|private@example|\b100000\b|1990-01-01|@private|202\) 555/u.test(
              content
            )
        )
      );
      const cv = resumeCvFromLino(contents[3]);
      assert.equal(cv.jobs[0].industries[0].id, '7.540');
      assert.equal(cv.jobs[0].start, '2020-05');
      assert.match(cv.jobs[0].website, /20200101000000/u);
      assert.deepEqual(
        provider.downloads.map((row) => row.format),
        ['html', 'doc', 'pdf', 'rtf']
      );
      await shot('exports-desktop');
    }
  );
};

const verifyExportRecovery = async ({
  page,
  action,
  view,
  records,
  terminal,
  fixture,
  run,
}) => {
  await run(
    'a lost admission reply is recovered by GET without another export or browser launch',
    async () => {
      await page.route('**/api/vacancies/resume-export', async (route) => {
        await route.fetch();
        await route.abort('failed');
      });
      await action('start').click();
      await view.locator('[data-resume-export-unknown]').waitFor();
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-resume-export-action="recover"]')
            .disabled
      );
      assert.equal(await action('start').isDisabled(), true);
      await page.unroute('**/api/vacancies/resume-export');
      const count = records.length;
      await action('recover').click();
      await terminal('completed');
      assert.equal(records.length, count);
      assert.equal(count, 2);
    }
  );
  await run(
    'an unreceived POST can be cancelled before any late admission, allowing an explicit fresh export',
    async () => {
      await page.route('**/api/vacancies/resume-export', (route) =>
        route.abort('failed')
      );
      await action('start').click();
      await view.locator('[data-resume-export-unknown]').waitFor();
      await page.waitForFunction(
        () =>
          !globalThis.document.querySelector(
            '[data-resume-export-action="stop"]'
          ).disabled
      );
      const requestId = await page.evaluate(() =>
        globalThis.localStorage.getItem('meta-sovereign:resume-export:jobs')
      );
      const count = records.length;
      await action('stop').click();
      await terminal('stopped');
      await page.unroute('**/api/vacancies/resume-export');
      const response = await page.request.post(
        `${fixture.base}/api/vacancies/resume-export`,
        {
          headers: {
            origin: fixture.base,
            accept: LINO_TEXT,
            'content-type': LINO_TEXT,
          },
          data: encodeWire({ requestId }, LINO_TEXT),
        }
      );
      assert.equal(response.status(), 200);
      assert.equal(
        decodeWire(await response.body(), response.headers()['content-type'])
          .state,
        'stopped'
      );
      assert.equal(records.length, count);
      assert.equal(await action('start').isEnabled(), true);
    }
  );
};

const verifyExportRetention = async ({
  panel,
  scope,
  action,
  terminal,
  provider,
  view,
  fixture,
  page,
  records,
  shot,
  run,
}) => {
  await run(
    'specific and all scopes preserve export-proven Russian and English language independently of title hints',
    async () => {
      await panel.locator('[data-vacancy-field="resume"]').fill('russian-old');
      await scope.selectOption('selected');
      await action('start').click();
      await terminal('completed');
      assert.equal(provider.downloads.at(-1).hash, 'russian-old');
      await scope.selectOption('all');
      await action('start').click();
      await terminal('completed');
      assert.equal(await view.locator('[data-resume-export]').count(), 3);
      const saved = await fixture.store.query((row) =>
        row.id?.startsWith('jobs-resume-export:')
      );
      assert.deepEqual(saved.map((row) => [row.hash, row.language]).sort(), [
        ['english', 'en'],
        ['russian-new', 'ru'],
        ['russian-old', 'ru'],
      ]);
    }
  );
  await run(
    'invalid native PDF bytes preserve the last verified catalog and phone reload recovers without HH reads',
    async () => {
      fixture.mode('bad-pdf');
      await action('start').click();
      await terminal('failed');
      assert.equal(await view.locator('[data-resume-export]').count(), 3);
      const count = records.length;
      await page.setViewportSize({ width: 390, height: 950 });
      await page.reload();
      await terminal('failed');
      await view.locator('[data-resume-export]').first().waitFor();
      assert.equal(records.length, count);
      assert.equal(
        await page.evaluate(
          () =>
            globalThis.document.documentElement.scrollWidth <=
            globalThis.innerWidth
        ),
        true
      );
      await shot('exports-phone-recovery');
    }
  );
  await run(
    'Stop drains a late owned launch before releasing export ownership',
    async () => {
      fixture.mode('ready');
      const release = fixture.holdLaunch();
      try {
        await action('start').click();
        await terminal('running');
        const cancelled = provider.cancellation();
        await panel.locator('[data-vacancy-action="stop"]').click();
        await cancelled;
      } finally {
        release();
      }
      await terminal('stopped');
      assert.equal(records.at(-1).closed, true);
      assert.deepEqual(records.at(-1).navigation, []);
      assert.equal(await view.locator('[data-resume-export]').count(), 3);
    }
  );
};

export const verifyResumeExports = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const provider = await resumeExportProvider();
  const fixture = await vacancyBrowserFixture(browser, { exports: provider });
  const { page, records } = fixture;
  const panel = page.locator('[data-vacancies]');
  const view = panel.locator('[data-resume-exports]');
  const action = (id) => view.locator(`[data-resume-export-action="${id}"]`);
  const scope = view.locator('[data-resume-export-scope]');
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('resume-exports', name, work);
    cases++;
  };
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      if (await view.count()) {
        await view.scrollIntoViewIfNeeded();
      }
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  const terminal = async (state) => {
    await page.waitForFunction((expected) => {
      const node = globalThis.document.querySelector(
        '[data-resume-export-state]'
      );
      const id = globalThis.localStorage.getItem(
        'meta-sovereign:resume-export:jobs'
      );
      return (
        node?.dataset.resumeExportRequest === id &&
        (expected === 'running'
          ? node.dataset.resumeExportState === expected
          : node.dataset.resumeExportState !== 'running')
      );
    }, state);
    assert.equal(
      await view
        .locator('[data-resume-export-state]')
        .getAttribute('data-resume-export-state'),
      state,
      await view.innerText()
    );
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await panel.waitFor();
    if (before) {
      await panel.scrollIntoViewIfNeeded();
      await shot('exports-before');
      assert.equal(
        await view.count(),
        1,
        'The CV view must export native HH resumes.'
      );
      return;
    }
    const context = {
      page,
      panel,
      scope,
      action,
      terminal,
      provider,
      view,
      fixture,
      records,
      shot,
      run,
    };
    await verifyLatestExport(context);
    await verifyExportRecovery(context);
    await verifyExportRetention(context);
    assert.ok(records.every((record) => record.closed && record.clicks === 0));
    assert.deepEqual(fixture.errors, []);
    return {
      cases,
      opens: records.length,
      downloads: provider.downloads.length,
      dictionaries: provider.dictionaries.length,
      providerClicks: 0,
    };
  } catch (error) {
    await shot('exports-failed');
    throw error;
  } finally {
    await fixture.close();
    await provider.close();
  }
};
