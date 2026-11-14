import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';
import {
  installResumeInputTrace,
  traceResumeInput,
} from './e2e-resume-input.mjs';

const verifyResumeChoice = async ({
  run,
  action,
  resumes,
  records,
  fixture,
  shot,
  field,
  page,
  panel,
}) => {
  await run(
    'native cards, escaped state and dates recommend a Russian title without private fields',
    async () => {
      await field('resume').fill('invalid/hash');
      await traceResumeInput(page, 'after-invalid-fill');
      assert.equal(await field('resume').inputValue(), 'invalid/hash');
      // Observe the rendered validation state after dispatching input instead
      // of sampling it synchronously, within the existing scenario deadline.
      await page.waitForFunction(
        () => document.querySelector('[data-vacancy-action="search"]')?.disabled
      );
      assert.equal(await action('search').isDisabled(), true);
      assert.equal(await action('resumes').isEnabled(), true);
      await action('resumes').click();
      await resumes.locator('[data-vacancy-resume]').first().waitFor();
      assert.equal(await resumes.locator('[data-vacancy-resume]').count(), 3);
      assert.match(
        await action('resume-suggested').innerText(),
        /Ведущий разработчик/u
      );
      assert.equal(records[0].options.slot, 'jobs');
      assert.equal(Object.hasOwn(records[0].options, 'headless'), false);
      const saved = await fixture.store.get('jobs-resumes:jobs');
      assert.ok(!JSON.stringify(saved).includes('private@example.test'));
      assert.ok(!JSON.stringify(saved).includes('+10000000000'));
      await shot('resumes-desktop');
    }
  );
  await run(
    'keyboard choice fixes the exact search hash across native pagination',
    async () => {
      const select = resumes.locator(
        '[data-vacancy-resume="russian-old"] button'
      );
      await select.focus();
      await page.keyboard.press('Enter');
      assert.equal(await field('resume').inputValue(), 'russian-old');
      assert.equal(await select.getAttribute('aria-pressed'), 'true');
      await action('search').click();
      await panel.locator('[data-vacancy-card]').first().waitFor();
      await action('next').click();
      await panel
        .locator('[data-vacancy-card="https://hh.ru/vacancy/125"]')
        .waitFor();
      assert.ok(
        records
          .slice(-2)
          .every(
            (record) =>
              new URL(record.navigation[0]).searchParams.get('resume') ===
              'russian-old'
          )
      );
    }
  );
};

const verifyResumeRefresh = async ({
  fixture,
  action,
  panel,
  resumes,
  field,
  shot,
}) => {
  for (const mode of ['conflict', 'incomplete', 'challenge']) {
    fixture.mode(mode);
    await action('resumes').click();
    await panel.locator('[data-vacancy-error]').waitFor();
    assert.equal(await resumes.locator('[data-vacancy-resume]').count(), 3);
    assert.equal(await field('resume').inputValue(), 'russian-old');
  }
  await shot('resumes-failed-refresh');
  fixture.mode('cards-only');
  await action('resumes').click();
  await panel.locator('[data-vacancy-error]').waitFor({ state: 'hidden' });
  await panel
    .page()
    .waitForFunction(
      () => !document.querySelector('[data-vacancy-action="resumes"]').disabled
    );
  const saved = await fixture.store.get('jobs-resumes:jobs');
  assert.equal(
    saved.entries[0].updatedText,
    'Обновлено 11 ноября 2026 в 10:00'
  );
  assert.equal(
    saved.entries[0].updatedAt,
    new Date(2026, 10, 11, 10).getTime()
  );
  assert.match(
    await action('resume-suggested').innerText(),
    /Ведущий разработчик/u
  );
  fixture.mode('ready');
};

export const verifyJobResumes = async (
  browser,
  { screenshots = process.env.E2E_ARTIFACT_DIR, before = false } = {}
) => {
  const fixture = await vacancyBrowserFixture(browser);
  const { page, records } = fixture;
  const panel = page.locator('[data-vacancies]');
  const resumes = panel.locator('[data-vacancy-resumes]');
  const action = (id) => panel.locator(`[data-vacancy-action="${id}"]`);
  const field = (key) => panel.locator(`[data-vacancy-field="${key}"]`);
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      if (await resumes.count()) {
        await resumes.scrollIntoViewIfNeeded();
      }
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('job-resumes', name, work);
    cases++;
  };
  try {
    await installResumeInputTrace(page);
    await page.goto(`${fixture.base}/#/cv`);
    await panel.waitFor();
    await traceResumeInput(page, 'panel-visible');
    if (before) {
      await panel.scrollIntoViewIfNeeded();
      await shot('resumes-before');
      assert.equal(
        await action('resumes').count(),
        1,
        'The CV view must read and select native HH resumes.'
      );
      return;
    }
    await verifyResumeChoice({
      run,
      action,
      resumes,
      records,
      fixture,
      shot,
      field,
      page,
      panel,
    });
    await run(
      'conflicting, loading and challenged refreshes retain the list; visible-only dates remain readable',
      () =>
        verifyResumeRefresh({ fixture, action, panel, resumes, field, shot })
    );
    await run(
      'Stop drains an inventory launch without touching a provider control',
      async () => {
        const release = fixture.holdLaunch();
        try {
          await action('resumes').click();
          await page.waitForFunction(
            () =>
              !document.querySelector('[data-vacancy-action="stop"]').disabled
          );
          const cancelled = fixture.cancellation();
          await action('stop').click();
          await cancelled;
        } finally {
          release();
        }
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-vacancy-action="resumes"]').disabled
        );
        assert.deepEqual(records.at(-1).navigation, []);
        assert.equal(records.at(-1).closed, true);
      }
    );
    await run(
      'state-only and explicit empty lists remain distinct from loading',
      async () => {
        fixture.mode('state-only');
        await action('resumes').click();
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-vacancy-action="resumes"]').disabled
        );
        assert.equal(await resumes.locator('[data-vacancy-resume]').count(), 3);
        await field('resumeLanguage').selectOption('any');
        assert.match(
          await action('resume-suggested').innerText(),
          /Senior Software Engineer/u
        );
        await action('resume-suggested').click();
        assert.equal(await field('resume').inputValue(), 'english');
        fixture.mode('empty');
        await action('resumes').click();
        await resumes
          .getByText('No resumes were observed in this list.', { exact: true })
          .waitFor();
        fixture.mode('ready');
        await action('resumes').click();
        await resumes.locator('[data-vacancy-resume]').first().waitFor();
      }
    );
    await run(
      'phone reload recovers the slot list and selected hash without reading HH again',
      async () => {
        const count = records.length;
        await page.setViewportSize({ width: 390, height: 950 });
        await page.reload();
        await resumes.locator('[data-vacancy-resume]').first().waitFor();
        assert.equal(records.length, count);
        assert.equal(await field('resume').inputValue(), 'english');
        assert.equal(await field('resumeLanguage').inputValue(), 'any');
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= globalThis.innerWidth
          ),
          true
        );
        await shot('resumes-phone');
      }
    );
    assert.deepEqual(fixture.errors, []);
    assert.ok(records.every((record) => record.closed && record.clicks === 0));
    return {
      cases,
      opens: records.length,
      providerClicks: 0,
      pageErrors: fixture.errors,
    };
  } catch (error) {
    await traceResumeInput(page, 'failure', true).catch(() => {});
    await shot('resumes-failed');
    throw error;
  } finally {
    await fixture.close();
  }
};
