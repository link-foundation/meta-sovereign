import { readFile } from 'node:fs/promises';
import { responseFor, decoded, planCurrent } from './e2e-form-review.mjs';
import { assert } from './e2e-chat.mjs';

const download = async (page, format) => {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page
      .locator(
        `[data-form-journal] > .row [data-action="download-form-${format}"]`
      )
      .click(),
  ]);
  return {
    name: file.suggestedFilename(),
    text: await readFile(await file.path(), 'utf8'),
  };
};

const captureMobile = async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('[data-form-journal] > h2')
    .evaluate((heading) => heading.scrollIntoView({ block: 'center' }));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'captured pages fit phone width'
  );
  if (process.env.FORMS_JOURNAL_SCREENSHOTS === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-journal-mobile.png',
    });
  }
};

export const verifyFormJournalUi = async ({ page, owned, fixture }) => {
  const autoCapture = page.locator('[data-form-auto-capture]');
  if (await autoCapture.count()) {
    await autoCapture.uncheck();
  }
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/prefill'));
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  const owner = owned.at(-1);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await pending);
  await page
    .locator('[data-form-profile]')
    .selectOption({ label: 'Application owner' });
  const plan = await planCurrent(page);
  const historyButton = page.locator('[data-review-action="history"]');
  if (process.env.FORMS_JOURNAL_BEFORE === '1') {
    await page.locator('[data-form-reviews]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-journal-before.png',
    });
    assert(
      await historyButton.count(),
      'captured pages are available after a reviewed plan'
    );
    return;
  }
  const field = plan.fields.find((item) => item.name === 'fullName');
  assert(field?.answer.applySupported, 'reviewed profile name is writable');
  await page.locator(`[data-form-select="${field.id}"]`).check();
  await page.locator('[data-form-replace]').check();
  pending = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const applied = await decoded(await pending);
  assert(applied.state === 'applied', 'actual selected name confirmed');
  assert(
    applied.reportFile.state === 'saved',
    'action report saved before response'
  );
  const saved = await readFile(applied.reportFile.path, 'utf8');
  assert(
    saved.includes('Proposed answer source: profile') &&
      saved.includes('Ada Example'),
    'saved action retains profile provenance and actual value'
  );
  await owner.page.goto(fixture.url);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await pending);
  const events = await owner.page.evaluate(() => [...globalThis.events]);
  pending = responseFor(page, 'history');
  await historyButton.click();
  const history = await decoded(await pending);
  await page.locator('[data-form-journal]').waitFor();
  assert(
    history.checkpoints.length === 4,
    'read, plan, verified action and next page retained'
  );
  assert(
    history.checkpoints[0].report.url.endsWith('/prefill') &&
      history.checkpoints[3].report.url.endsWith('/application'),
    'both captured pages remain distinct'
  );
  assert(
    (await page.locator('[data-action="plan-form"]').count()) === 0,
    'history offers no live planning authority'
  );
  await page.locator('[data-form-checkpoint="3"]').click();
  await page.locator('[data-form-application="applied"]').waitFor();
  assert(
    (await page.locator('[data-action="apply-form-plan"]').count()) === 0,
    'historic proposal cannot be applied'
  );
  assert(
    (await page.locator('[data-form-select]').count()) === 0,
    'historic questions have no fill selection'
  );
  const markdown = await download(page, 'markdown');
  const json = await download(page, 'report');
  assert(
    markdown.name.endsWith('.md') && markdown.text.includes('# Checkpoint 4:'),
    'Markdown contains accumulated checkpoints'
  );
  assert(
    JSON.parse(json.text).checkpoints.length === 4,
    'JSON export retains all captured checkpoints'
  );
  assert(
    JSON.stringify(await owner.page.evaluate(() => globalThis.events)) ===
      JSON.stringify(events),
    'history and downloads never interact with the form'
  );
  if (process.env.FORMS_JOURNAL_SCREENSHOTS === '1') {
    await page
      .locator('[data-form-journal] > h2')
      .evaluate((heading) => heading.scrollIntoView({ block: 'center' }));
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-journal-after.png',
    });
  }
  await captureMobile(page);
  pending = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await pending);
  assert(
    owner.closed && fixture.submits === 0,
    'owned review closes with no submission'
  );
};
