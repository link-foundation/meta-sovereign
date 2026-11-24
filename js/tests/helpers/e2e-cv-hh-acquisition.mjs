import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';
import { resumeExportProvider } from '../../../experiments/issue-56/resume-export-provider.mjs';
import { storedExperienceDocuments } from '../../src/cv/experience-store.js';

export const verifyHhAcquisition = async (
  browser,
  { before, screenshots } = {}
) => {
  const provider = await resumeExportProvider();
  const fixture = await vacancyBrowserFixture(browser, { exports: provider });
  const { page, records, store } = fixture;
  page.setDefaultTimeout(10000);
  const panel = page.locator('[data-experience-documents]');
  const native = panel.locator('[data-hh-acquisition]');
  const action = (id) => native.locator(`[data-hh-acquisition-action="${id}"]`);
  const field = (id) => native.locator(`[data-hh-acquisition-field="${id}"]`);
  const phase = async (id) => {
    const terminal = native.locator(
      '[data-hh-acquisition-phase]:not([data-hh-acquisition-phase="checking-cache"], [data-hh-acquisition-phase="exporting"])'
    );
    await terminal.waitFor({ timeout: 25000 });
    assert.equal(
      await terminal.getAttribute('data-hh-acquisition-phase'),
      id,
      await native.innerText()
    );
  };
  const openPanel = async (selector) => {
    const detail = page.locator(selector);
    await detail.locator(':scope > summary').click();
    return detail;
  };
  const capture = async (locator, name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await locator.evaluate((element) =>
        element.scrollIntoView({ block: 'center' })
      );
      await locator.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  let starts = 0;
  const responses = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/cv/experience/hh-start')) {
      starts++;
    }
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/cv/experience/hh-')) {
      responses.push([
        response.request().method(),
        new URL(response.url()).pathname,
        response.status(),
      ]);
    }
  });
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await openPanel('[data-experience-documents]');
    if (before) {
      await capture(
        panel.locator('[data-experience-hh-export]').locator('../..'),
        'before'
      );
      assert.equal(
        await native.count(),
        1,
        'CV needs its own cache-aware HeadHunter acquisition action.'
      );
      return;
    }
    await openPanel('[data-hh-acquisition]');
    await field('hash').fill('russian-new');
    await action('start').click();
    await phase('native');
    assert.deepEqual(provider.downloads, [
      { hash: 'russian-new', format: 'html' },
    ]);
    assert.equal(records[0].options.slot, 'jobs');
    assert.equal(records[0].closed, true);
    await action('select').click();
    const choice = panel.locator('[data-experience-choice="hh"]');
    await page.waitForFunction(
      () => document.querySelector('[data-experience-choice="hh"]').value !== ''
    );
    const original = await choice.inputValue();
    assert.equal(
      (await storedExperienceDocuments(store)).entries[0].revision,
      original
    );
    await action('new').click();
    await action('start').click();
    await phase('cached');
    await capture(native, 'cached');
    assert.equal(records.length, 1);
    await action('new').click();
    await page.route('**/api/cv/experience/hh-start', async (route) => {
      await route.fetch();
      await route.abort();
    });
    await action('refresh').click();
    await native.getByRole('alert').waitFor();
    assert.equal(await action('refresh').isDisabled(), true);
    await page.unroute('**/api/cv/experience/hh-start');
    const requestId = await field('requestId').inputValue();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await openPanel('[data-experience-documents]');
    await openPanel('[data-hh-acquisition]');
    await phase('native');
    assert.equal(await field('requestId').inputValue(), requestId);
    assert.equal(starts, 3);
    assert.equal(records.length, 2);
    assert.deepEqual(provider.downloads, [
      { hash: 'russian-new', format: 'html' },
      { hash: 'russian-new', format: 'html' },
    ]);
    await action('select').click();
    const latest = (await storedExperienceDocuments(store)).entries[0].revision;
    assert.notEqual(latest, original);
    await page.waitForFunction(
      (revision) =>
        document.querySelector('[data-experience-choice="hh"]').value ===
        revision,
      latest
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      true
    );
    await capture(native, 'fresh-phone');
    assert.ok(records.every((record) => record.closed && record.clicks === 0));
    assert.deepEqual(fixture.errors, []);
    return {
      starts,
      opens: records.length,
      downloads: provider.downloads.length,
      providerClicks: 0,
    };
  } catch (error) {
    const jobs = (
      await store.query(
        (row) =>
          row.id?.startsWith('secret:cv-hh-acquisition:') ||
          row.id?.startsWith('jobs-resume-request:')
      )
    ).map((row) => ({ phase: row.phase ?? row.state, code: row.code }));
    const observed = {
      jobs,
      starts,
      responses: responses.slice(-8),
      navigations: records.map((row) => row.navigation),
      downloads: provider.downloads,
      view: await native.innerText().catch(() => ''),
    };
    throw new Error(
      `HeadHunter acquisition fixture stopped at ${JSON.stringify(observed)}`,
      { cause: error }
    );
  } finally {
    await fixture.close();
    await provider.close();
  }
};
