import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resumeLanguageBrowserFixture } from '../../../experiments/issue-56/resume-language-browser-fixture.mjs';

export const verifyResumeLanguage = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await resumeLanguageBrowserFixture(browser);
  const { page, records } = fixture;
  const resumes = page.locator('[data-vacancy-resumes]');
  const action = (name) => page.locator(`[data-vacancy-action="${name}"]`);
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await resumes.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(screenshots, `resume-language-${name}.png`),
      });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await action('resumes').click();
    await resumes.locator('[data-vacancy-resume]').first().waitFor();
    if (before) {
      await shot('before');
    }
    assert.match(
      await action('resume-suggested').innerText(),
      /Senior Software Engineer/u,
      'A checked Russian export must outrank title hints.'
    );
    await resumes.locator('[data-resume-language="ru"]').waitFor();
    assert.equal(await resumes.locator('[data-resume-language]').count(), 1);
    await action('resume-suggested').click();
    assert.equal(
      await page.locator('[data-vacancy-field="resume"]').inputValue(),
      'english'
    );
    await shot('after');
    const manual = resumes.locator(
      '[data-vacancy-resume="russian-old"] button'
    );
    await manual.focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await page.locator('[data-vacancy-field="resume"]').inputValue(),
      'russian-old'
    );
    const opened = records.length;
    await page.setViewportSize({ width: 390, height: 950 });
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (value) =>
          globalThis.localStorage.setItem('metaSovereignLocale', value),
        locale
      );
      await page.reload();
      await resumes.locator('[data-resume-language="ru"]').waitFor();
      assert.equal(
        await page.locator('[data-vacancy-field="resume"]').inputValue(),
        'russian-old'
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > globalThis.innerWidth
        ),
        false
      );
    }
    await shot('phone');
    assert.equal(records.length, opened);
    assert.ok(records.every((record) => record.closed && record.clicks === 0));
    assert.deepEqual(fixture.errors, []);
    return {
      verifiedLanguage: 'ru',
      suggested: 'english',
      manual: 'russian-old',
      opens: opened,
      providerClicks: 0,
      locales: 4,
      pageErrors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
