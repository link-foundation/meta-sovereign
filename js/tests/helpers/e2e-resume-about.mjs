import assert from 'node:assert/strict';
import { readResumeExportHtml } from '../../src/jobs/resume-export-dom.js';

export const verifyResumeAboutEvidence = async (browser) => {
  const page = await browser.newPage();
  try {
    const block = (content, label = 'About me') =>
      `<div class="resume-skils"><p class="bloko-form-hint">${label}</p>${content}</div>`;
    for (const [section, observed, about] of [
      ['', false, ''],
      [block(''), true, ''],
      [
        block('Build software.<br>Keep it reliable.', 'Обо мне'),
        true,
        'Build software.\nKeep it reliable.',
      ],
      [block('First') + block('Second', 'About'), false, ''],
      [block('<p class="bloko-form-hint">Another label</p>'), false, ''],
      [
        block('<script>globalThis.fixtureAboutExecuted = true</script>'),
        true,
        '',
      ],
    ]) {
      const html = `<!doctype html><h1 class="resume__title">Fixture Owner</h1>
        <h2 class="resume__position">Engineer</h2><p>Resume updated today</p>${section}`;
      const result = await page.evaluate(readResumeExportHtml, { html });
      assert.equal(result.observed, true);
      assert.equal(result.aboutObserved, observed);
      assert.equal(result.about, about);
    }
    assert.equal(
      await page.evaluate(() => globalThis.fixtureAboutExecuted),
      undefined
    );
  } finally {
    await page.close();
  }
};
