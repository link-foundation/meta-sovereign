import assert from 'node:assert/strict';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';
import { cvSaveAttempt } from '../../src/jobs/cv-watch-verification.js';
import { clickCvPreparation } from './e2e-cv-prepare-recovery.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';
import { decodeWire } from '../../src/transport/lino.js';

export const verifyCvWorkplaceCopy = async (browser) => {
  const f = await cvWorkplacePrepareBrowserFixture(browser, {
    fieldsMode: true,
    copyMode: true,
  });
  const { identity, cv } = f.data.sources.find(
    (row) => row.identity.language === 'en'
  );
  const { provider, page, counters } = f;
  const panel = page.locator('[data-cv-workplace-review]');
  const action = (name) =>
    panel.locator(`[data-cv-workplace-action="${name}"]`);
  const prepare = action('prepare');
  const prepareAs = async (state) => {
    const receipt = page
      .waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/vacancies/cv-prepare' &&
          response.request().method() === 'POST'
      )
      .then(async (response) => {
        const reply = decodeWire(
          await response.body(),
          response.headers()['content-type']
        );
        assert.equal(
          reply.preparation?.state,
          state,
          JSON.stringify(reply.preparation ?? reply)
        );
      });
    await Promise.all([receipt, clickCvPreparation(page, prepare, state)]);
  };
  const read = () => provider.evaluate(readCvEditorDocument);
  const nativeActions = () =>
    provider.evaluate(() => ({
      clicks: Number(globalThis.sessionStorage.fixtureListClicks),
      inputs: globalThis.fixtureInputs,
      saves: globalThis.fixtureSaves,
      cancels: globalThis.fixtureCancels,
    }));
  const launch = (options) =>
    f.open({ screen: 'overview', shared: true, ...options });
  const description = 'Reviewed copy for the English CV';
  const run = (name, work) =>
    traceBrowserScenario('cv-workplace-copy', name, work);
  try {
    await launch();
    await page.goto(`${f.base}/#/cv`);
    await panel
      .locator('[data-cv-workplace-export]')
      .selectOption(`${identity.exportId}:${identity.hash}`);
    await action('loadSource').click();
    await panel.locator('[data-cv-workplace-record]').fill('123');
    await panel.locator('[data-cv-workplace-operation]').selectOption('copy');
    assert.equal(await action('propose').isDisabled(), true);
    const list = provider.url();
    const navigations = counters.navigations;
    await action('loadMembership').click();
    await panel.locator('[data-cv-workplace-membership]').waitFor();
    assert.equal(counters.navigations, navigations);
    assert.equal(provider.url(), list);
    await panel
      .locator('[data-cv-workplace-field="description"]')
      .fill(description);
    await action('propose').click();
    await panel.locator('[data-cv-workplace-plan="draft"]').waitFor();
    assert.equal(await prepare.count(), 0);
    await action('approve').click();
    await panel.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
    await run(
      'read shared source and prepare a target-only draft through native Add',
      async () => {
        await prepareAs('prepared');
        const copy = cvSaveAttempt(await read());
        const job = cv.jobs[0];
        assert.equal(copy.recordId, null);
        assert.equal(copy.description, description);
        for (const field of [
          'company',
          'position',
          'start',
          'end',
          'current',
          'area',
          'website',
        ]) {
          assert.equal(copy[field], job[field]);
        }
        assert.equal(
          copy.industryText,
          job.industries.map((row) => row.name).join(', ')
        );
        assert.deepEqual(
          copy.resumes.filter((row) => row.checked),
          [{ hash: identity.hash, checked: true }]
        );
        const actions = await nativeActions();
        assert.equal(actions.clicks, 1);
        assert.ok(actions.inputs > 0);
        assert.equal(actions.saves, 0);
        assert.equal(actions.cancels, 0);
        const original = await provider.evaluate(async () => {
          const response = await fetch('/profile/edit/experience/123');
          const html = new globalThis.DOMParser().parseFromString(
            await response.text(),
            'text/html'
          );
          return {
            description: html.querySelector('textarea')?.value,
            selections: [
              ...html.querySelectorAll(
                '[data-qa^="profile-resumes-list-checkbox-"]'
              ),
            ].map((row) => row.checked),
          };
        });
        assert.deepEqual(original, {
          description: job.description,
          selections: [true, true],
        });
      }
    );
    await run(
      'existing owner draft and duplicate Add control block preparation',
      async () => {
        await f.open({ shared: true });
        await provider.waitForFunction(() => globalThis.fixtureHydrated);
        await provider.locator('textarea').fill('Owner native draft');
        const before = counters.navigations;
        await prepareAs('failed');
        assert.equal(counters.navigations, before);
        assert.equal(
          await provider.locator('textarea').inputValue(),
          'Owner native draft'
        );
        await launch({ list: { duplicateAdd: true } });
        await prepareAs('uncertain');
        assert.equal((await nativeActions()).clicks, 0);
      }
    );
    await run(
      'stale shared membership and owner typing during source read leave the form untouched',
      async () => {
        await launch({ shared: false });
        await prepareAs('uncertain');
        assert.equal(await provider.locator('textarea').inputValue(), '');
        assert.equal((await nativeActions()).inputs, 0);
        await launch();
        f.beforeRead(() =>
          provider.locator('textarea').fill('Owner edit during verification')
        );
        await prepareAs('uncertain');
        assert.equal(
          await provider.locator('textarea').inputValue(),
          'Owner edit during verification'
        );
        assert.equal(
          await provider.locator('input[name="company"]').inputValue(),
          ''
        );
        assert.equal(counters.saves, 0);
      }
    );
    assert.equal(counters.attached, counters.detached);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
};
