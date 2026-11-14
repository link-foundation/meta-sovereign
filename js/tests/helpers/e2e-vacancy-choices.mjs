import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';
import { vacancyUrl } from '../../../experiments/issue-56/vacancy-fixture.mjs';
import { vacancyChoiceId } from '../../src/jobs/vacancy-choice.js';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

const screenshot = (page, directory) => async (name) => {
  if (!directory) {
    return;
  }
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
};

const phoneScreenshot = async (page, saved, shot) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await saved().scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    true
  );
  await shot('phone');
};

const originalRecord = async (store) => {
  const previous = await store.get(vacancyChoiceId('jobs'));
  await store.put({
    ...previous,
    revision: globalThis.crypto.randomUUID(),
    entries: [
      { ...previous.entries[0], note: 'Owner changed this in another client.' },
    ],
  });
};

export const verifyVacancyChoices = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await vacancyBrowserFixture(browser);
  const { page, store, records } = fixture;
  const panel = page.locator('[data-vacancies]');
  const choices = panel.locator('[data-vacancy-choices]');
  const field = panel.locator('[data-vacancy-field="browserSlot"]');
  const card = () => panel.locator(`[data-vacancy-card="${vacancyUrl}"]`);
  const action = (root, kind) =>
    root.locator(`[data-vacancy-choice-action="${kind}"]`);
  const saved = () =>
    choices.locator(`[data-saved-vacancy-choice="${vacancyUrl}"]`);
  const ready = () => action(choices, 'reload').isEnabled();
  const shot = screenshot(page, screenshots);
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await panel.waitFor();
    if (before) {
      await panel
        .locator('[data-vacancy-action="search"]')
        .scrollIntoViewIfNeeded();
      await shot('before');
      assert.equal(
        await choices.count(),
        1,
        'Saved owner vacancy choices must be available'
      );
      return;
    }
    await traceBrowserScenario(
      'vacancy-choices',
      'native search, private owner deferral and restart recovery',
      async () => {
        await panel.locator('[data-vacancy-field="query"]').fill('Python');
        await panel
          .locator('[data-vacancy-field="resume"]')
          .fill('selected-resume');
        await panel.locator('[data-vacancy-action="search"]').click();
        await card().waitFor();
        const note = card().locator('[data-vacancy-choice-note]');
        await note.fill('Ask about remote working hours.');
        await action(card(), 'deferred').click();
        await saved().waitFor();
        await saved()
          .locator('[data-vacancy-choice-state="deferred"]')
          .waitFor();
        assert.equal(
          (await store.get(vacancyChoiceId('jobs'))).entries[0].note,
          'Ask about remote working hours.'
        );
        assert.equal(records.length, 1);
        await saved().scrollIntoViewIfNeeded();
        await shot('after');
        await page.reload();
        await saved().waitFor();
        assert.equal(
          await saved().locator('textarea').inputValue(),
          'Ask about remote working hours.'
        );
        assert.equal(
          records.length,
          1,
          'Reload must not replay provider reads'
        );
      }
    );
    await traceBrowserScenario(
      'vacancy-choices',
      'slot isolation and permanent exclusion remain reversible',
      async () => {
        await field.fill('other');
        await page.waitForFunction(() =>
          document
            .querySelector('[data-vacancy-choices="other"]')
            ?.textContent.includes('No saved exclusions')
        );
        assert.equal(
          await choices.locator('[data-saved-vacancy-choice]').count(),
          0
        );
        await field.fill('jobs');
        await saved().waitFor();
        await action(saved(), 'skipped').click();
        await saved()
          .locator('[data-vacancy-choice-state="skipped"]')
          .waitFor();
        assert.equal(
          (await store.get(vacancyChoiceId('jobs'))).entries[0].state,
          'skipped'
        );
        assert.equal(await store.get(vacancyChoiceId('other')), null);
      }
    );
    await traceBrowserScenario(
      'vacancy-choices',
      'stale revision refuses overwrite and explicit reload preserves a newer owner note',
      async () => {
        await originalRecord(store);
        await action(saved(), 'deferred').click();
        await choices.getByRole('alert').waitFor();
        assert.equal(await action(saved(), 'skipped').isDisabled(), true);
        assert.equal(
          (await store.get(vacancyChoiceId('jobs'))).entries[0].note,
          'Owner changed this in another client.'
        );
        await action(choices, 'reload').click();
        await page.waitForFunction(
          () => !document.querySelector('[data-vacancy-choices] [role="alert"]')
        );
        // A prior local textarea draft stays local; fresh mounts show acknowledged notes.
        await page.reload();
        await saved().waitFor();
        assert.equal(
          await saved().locator('textarea').inputValue(),
          'Owner changed this in another client.'
        );
        await phoneScreenshot(page, saved, shot);
        await action(saved(), 'clear').click();
        await page.waitForFunction(
          () => !document.querySelector('[data-saved-vacancy-choice]')
        );
        assert.deepEqual(
          (await store.get(vacancyChoiceId('jobs'))).entries,
          []
        );
        assert.equal(await ready(), true);
      }
    );
    assert.deepEqual(fixture.errors, []);
    assert.ok(records.every((record) => record.closed && record.clicks === 0));
    return {
      providerReads: records.length,
      providerClicks: 0,
      pageErrors: fixture.errors,
    };
  } catch (error) {
    await shot('failed');
    throw error;
  } finally {
    await fixture.close();
  }
};
