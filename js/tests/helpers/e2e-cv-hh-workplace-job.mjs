import assert from 'node:assert/strict';
import path from 'node:path';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import {
  completeWorkplaceExperience,
  seedWorkplaceExperience,
} from '../../../experiments/issue-56/cv-workplace-experience-fixture.mjs';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';

export const verifyHhWorkplaceJob = async (browser) => {
  const fixture = await cvWorkplacePrepareBrowserFixture(browser, {
    fieldsMode: true,
    followupMode: true,
    singleTarget: true,
    experienceMode: true,
  });
  const { page, provider, cookieSource, store, data, counters, followup } =
    fixture;
  const review = page.locator('[data-experience-workplace-review]');
  const job = review.locator('[data-hh-workplace-phase]');
  const action = (name) => job.locator(`[data-hh-workplace-action="${name}"]`);
  const phase = (name) =>
    review.locator(`[data-hh-workplace-phase="${name}"]`).waitFor({
      timeout: 9000,
    });
  const screenshot = async (name, section) => {
    if (process.env.HH_WORKPLACE_SCREENSHOTS) {
      await section.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(process.env.HH_WORKPLACE_SCREENSHOTS, `${name}.png`),
      });
    }
  };
  try {
    const { hh, linkedin, matched, added } = await seedWorkplaceExperience({
      store,
      sources: data.sources,
      artifactRoot: data.artifactRoot,
    });
    linkedin.jobs = [matched, added];
    const comparison = await completeWorkplaceExperience(store, hh, linkedin);
    const { identity } = data.sources.find(({ cv }) => cv.language === 'en');
    const other = data.sources.find(({ cv }) => cv.language === 'ru');
    const otherExport = followup.export(other.identity.hash);
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-experience-documents] summary').first().click();
    const panel = page.locator('[data-experience-plan]');
    await panel.locator('[data-experience-plan-to]').selectOption('hh');
    await panel
      .locator('[data-experience-plan-request]')
      .fill(comparison.requestId);
    await panel.locator('[data-experience-plan-action="status"]').click();
    const update = panel.locator('[data-experience-plan-kind="update"]');
    await update.locator('[data-experience-workplace-select]').click();
    await update.locator('[data-experience-workplace-record]').fill('123');
    await update.locator('button[type="submit"]').click();
    await review.locator('[data-cv-workplace-action="approve"]').click();
    await review.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
    if (process.env.HH_WORKPLACE_BEFORE === '1') {
      await screenshot(
        'before',
        review.locator('[data-cv-workplace-action="prepare"]')
      );
      assert.equal(
        await action('start').count(),
        1,
        'The approved review needs a separate Experience window.'
      );
      return;
    }
    assert.equal(counters.saves, 0);
    assert.equal(counters.navigations, 0);
    const startRoute = '**/api/cv/experience/hh-workplace-start';
    let starts = 0;
    await page.route(startRoute, async (route) => {
      starts++;
      await route.fetch();
      await route.abort('connectionreset');
    });
    await action('start').click();
    await phase('unknown');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await phase('prepared');
    assert.equal(starts, 1);
    assert.equal(counters.experienceSlot, 'hh-experience-slot');
    assert.equal(counters.attached, 1);
    assert.equal(counters.saves, 0);
    assert.equal(counters.sourceDetached, 1);
    assert.ok(
      counters.experienceProfile.endsWith(
        path.join('browser-profiles', 'cv-experience', 'hh-experience-slot')
      )
    );
    assert.ok(
      counters.sourceProfile.endsWith(
        path.join('browser-profiles', 'hh', 'slots', 'jobs')
      )
    );
    assert.equal(cookieSource.url(), 'https://hh.ru/applicant/resumes');
    assert.deepEqual(
      (await provider.context().cookies()).map(({ name }) => name),
      ['fixture-hh-session']
    );
    assert.equal(
      (await provider.evaluate(readCvEditorDocument)).description,
      matched.description
    );
    assert.ok(
      await review.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
    );
    await screenshot('prepared-phone', job);
    await page.unroute(startRoute);
    await action('skip').click();
    await phase('skipped');
    assert.equal(
      await provider.evaluate(() => globalThis.sessionStorage.fixtureDiscards),
      '1'
    );
    assert.equal(counters.saves, 0);

    await action('reset').click();
    await action('start').click();
    await phase('prepared');
    await action('leave').click();
    await phase('stopped');
    const draft = await provider.evaluate(readCvEditorDocument);
    const previousUrl = provider.url();
    const previousNavigations = counters.navigations;
    await action('reset').click();
    await action('start').click();
    await phase('failed');
    assert.equal(provider.url(), previousUrl);
    assert.equal(counters.navigations, previousNavigations);
    assert.deepEqual(await provider.evaluate(readCvEditorDocument), draft);
    assert.equal(counters.saves, 0);

    await fixture.open({ screen: 'overview' });
    await action('reset').click();
    await action('start').click();
    await phase('prepared');
    await action('save').click();
    await phase('saved');
    assert.equal(counters.saves, 1);
    assert.match(
      followup.export(identity.hash),
      /Reviewed changes from the source CV/u
    );
    assert.equal(followup.export(other.identity.hash), otherExport);
    assert.equal(counters.attached, counters.detached);
    assert.equal(counters.sourceDetached, 1);
    assert.equal(cookieSource.url(), 'https://hh.ru/applicant/resumes');
    assert.deepEqual(fixture.errors, []);
    await screenshot('verified-phone', job);
    return {
      lostStarts: starts,
      saves: counters.saves,
      discards: 1,
      draftPreservations: 1,
    };
  } finally {
    await fixture.close();
  }
};
