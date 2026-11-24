import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvPrepareBrowserFixture } from '../../../experiments/issue-56/cv-prepare-browser-fixture.mjs';

export const verifyHhAboutJob = async (browser) => {
  const fixture = await cvPrepareBrowserFixture(browser, { reviewAbout: true });
  const { page, provider, about, counters } = fixture;
  page.setDefaultTimeout(10000);
  const profile = page.locator('[data-experience-plan-kind="profile"]');
  const job = profile.locator('[data-hh-about-phase]');
  const action = (name) => job.locator(`[data-hh-workplace-action="${name}"]`);
  const phase = (name) =>
    profile.locator(`[data-hh-about-phase="${name}"]`).waitFor();
  const metrics = () =>
    provider.evaluate(() => [
      globalThis.fixtureOpeners,
      globalThis.fixtureSaves,
      globalThis.fixtureCancels,
    ]);
  const shot = async (name, section) => {
    const directory = process.env.HH_ABOUT_SCREENSHOTS;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await section.scrollIntoViewIfNeeded();
      await section.page().screenshot({ path: join(directory, `${name}.png`) });
    }
  };
  const sameCv = () =>
    fixture.open({ hash: about.identity.hash, about: about.before });
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-experience-documents] summary').first().click();
    const panel = page.locator('[data-experience-plan]');
    await panel.locator('[data-experience-plan-to]').selectOption('hh');
    await panel
      .locator('[data-experience-plan-request]')
      .fill(about.comparison.requestId);
    await panel.locator('[data-experience-plan-action="status"]').click();
    await profile.waitFor();
    assert.match(await profile.textContent(), /maintain their infrastructure/u);
    if (process.env.HH_ABOUT_BEFORE === '1') {
      await shot('before', profile);
      assert.equal(
        await action('start').count(),
        1,
        'The directed About change needs a native review action'
      );
      return;
    }
    await action('start').click();
    await phase('prepared');
    const field = provider.locator('textarea[data-qa="resume-editor-about"]');
    assert.equal(await field.inputValue(), about.after);
    assert.deepEqual(await metrics(), [1, 0, 0]);
    await shot('native-draft', field);
    await action('skip').click();
    await phase('skipped');
    assert.deepEqual(await metrics(), [1, 0, 1]);
    await action('reset').click();
    await action('start').click();
    await phase('prepared');
    await action('leave').click();
    await phase('stopped');
    assert.equal(await field.inputValue(), about.after);
    assert.deepEqual(await metrics(), [2, 0, 1]);

    await sameCv();
    await action('reset').click();
    await action('start').click();
    await phase('prepared');
    await field.fill('The owner changed this draft.');
    await action('save').click();
    await phase('failed');
    assert.equal(await field.inputValue(), 'The owner changed this draft.');
    assert.deepEqual(await metrics(), [1, 0, 0]);

    await sameCv();
    await action('reset').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await action('start').click();
    await phase('prepared');
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth + 1
      )
    );
    await shot('review-phone', job);
    await provider.getByRole('button', { name: 'Save', exact: true }).click();
    await phase('saved');
    assert.match(await job.textContent(), /fresh export confirms/u);
    assert.deepEqual(await metrics(), [1, 1, 0]);
    assert.equal(counters.sourceSlot, 'jobs');
    assert.equal(counters.attached, counters.detached);
    assert.deepEqual(fixture.errors, []);
    await shot('saved-phone', job);
  } finally {
    await fixture.close();
  }
};
