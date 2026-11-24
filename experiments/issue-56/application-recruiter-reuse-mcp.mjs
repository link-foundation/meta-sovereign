export default async (page) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.setViewportSize({ width: 1140, height: 1000 });
  page.setDefaultTimeout(10000);
  await page.goto('FIXTURE_BASE/#/cv');
  const vacancies = page.locator('[data-vacancies]');
  const panel = page.locator('[data-application-panel]');
  const option = (name) => panel.locator(`[data-application-option="${name}"]`);
  const batch = panel.locator('[data-application-batch]');
  const action = (name) =>
    batch.locator(`[data-application-batch-action="${name}"]`);
  const field = (name) =>
    batch.locator(`[data-application-batch-field="${name}"]`);
  const phase = (name) =>
    batch
      .locator(`[data-application-batch-phase="${name}"]`)
      .waitFor({ timeout: 60000 });
  const stats = async (path = '/', method = 'GET') =>
    (await page.request.fetch(`FIXTURE_STATS${path}`, { method })).json();
  await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
  await vacancies.locator('[data-vacancy-action="search"]').click();
  await vacancies.locator('[data-vacancy-action="collect"]').first().click();
  await panel.locator('[data-application-missing]').waitFor();
  await option('autoSelectResumeLanguage').uncheck();
  await option('applyFromVacancyPage').uncheck();
  await option('applicationSearchUrl').fill(
    'https://hh.ru/search/vacancy?text=Python&area=1&page=2&experience=between3And6'
  );
  await option('vacancyPreviewSeconds').fill('0');
  if (
    (await option('autoSendExactAnswers').isChecked()) ||
    (await option('autoReuseAnswers').isChecked())
  ) {
    throw new Error('Neither reply mode should start enabled');
  }
  await option('autoReuseAnswers').click();
  await option('autoReuseAnswers').and(page.locator(':checked')).waitFor();
  await field('urls').fill('https://hh.ru/vacancy/123');
  await field('maxApplications').fill('1');
  await field('confirmBatch').check();
  await action('start').click();
  await phase('review');
  await action('follow').click();
  const review = panel.locator('[data-application-state="review"]');
  if (!(await review.isVisible())) {
    await panel.locator('[data-application-action="recover"]').click();
  }
  await review.waitFor();
  await option('confirm').check();
  await panel.locator('[data-application-action="submit"]').click();
  await panel
    .locator('[data-application-recruiter-chat="open"]')
    .waitFor({ timeout: 30000 });
  const active = await stats();
  await stats('/reuse/offer', 'POST');
  await phase('review');
  // Span more than one native polling interval with the hidden draft present.
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const held = await stats();
  if (
    !held.panelOpen ||
    !held.draft ||
    held.draft !== active.draft ||
    held.recruiterSends !== 0 ||
    held.reuseReceipts.length
  ) {
    throw new Error(JSON.stringify({ active, held }));
  }
  await stats('/draft/clear', 'POST');
  const reply = panel.locator(
    '[data-application-recruiter-reply="provider-confirmed"]'
  );
  await reply.waitFor({ timeout: 30000 });
  await page.setViewportSize({ width: 390, height: 1440 });
  await page.reload();
  await reply.waitFor({ timeout: 30000 });
  const pageWidth = await page.evaluate(() => ({
    width: globalThis.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  await reply.locator('..').screenshot({ path: 'SCREENSHOT_PATH' });
  const recovered = await stats();
  const receipt = recovered.reuseReceipts[0]?.receipt;
  if (
    recovered.recruiterSends !== 1 ||
    recovered.reuseReceipts.length !== 1 ||
    recovered.reuseReceipts[0]?.status !== 'sent' ||
    receipt?.messageId !== '4' ||
    receipt?.option !== 'Да. Используем те же ответы' ||
    pageWidth.scrollWidth > pageWidth.width
  ) {
    throw new Error(JSON.stringify({ recovered, pageWidth }));
  }
  await stats('/dismiss', 'POST');
  await phase('completed');
  const finished = await stats();
  if (finished.panelOpen || finished.errors.length || failures.length) {
    throw new Error(JSON.stringify({ finished, failures }));
  }
  return { held, recovered, finished, pageWidth, pageErrors: failures };
};
