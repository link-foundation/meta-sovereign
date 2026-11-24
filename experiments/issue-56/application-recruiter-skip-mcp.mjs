export default async (page, dismissal = 'FIXTURE_RECRUITER_DISMISSAL') => {
  const quiet = dismissal === 'quiet';
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1140, height: 1000 });
  page.setDefaultTimeout(10000);
  await page.goto('FIXTURE_BASE/#/cv');
  const tutorialOff = page.locator('[data-action="tutorial-off"]');
  if (await tutorialOff.isVisible()) {
    await tutorialOff.click();
  }
  const vacancies = page.locator('[data-vacancies]');
  const panel = page.locator('[data-application-panel]');
  const option = (name) => panel.locator(`[data-application-option="${name}"]`);
  const batch = panel.locator('[data-application-batch]');
  const action = (name) =>
    batch.locator(`[data-application-batch-action="${name}"]`);
  const field = (name) =>
    batch.locator(`[data-application-batch-field="${name}"]`);
  const phase = (name) =>
    batch.locator(`[data-application-batch-phase="${name}"]`).waitFor({
      timeout: 60000,
    });
  const stats = async (path = '/', method = 'GET') =>
    (await page.request.fetch(`FIXTURE_STATS${path}`, { method })).json();
  const recover = panel.locator('[data-application-action="recover"]');
  const skip = panel.locator('[data-application-action="skip-recruiter"]');
  const advance = async (control) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await control.and(page.locator(':enabled')).waitFor();
      const attempted = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
          '/api/vacancies/application-advance'
      );
      await control.click();
      const result = await attempted;
      if (result.ok()) {
        return;
      }
      const error = await result.text();
      if (!error.includes('jobs-busy') || attempt === 5) {
        throw new Error(error);
      }
      await recover.click();
    }
  };
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
  await field('urls').fill('https://hh.ru/vacancy/123');
  await field('maxApplications').fill('1');
  await field('confirmBatch').check();
  await action('start').click();
  await phase('review');
  await action('follow').click();
  const review = panel.locator('[data-application-state="review"]');
  if (!(await review.isVisible())) {
    await recover.click();
  }
  await review.waitFor();
  if (quiet) {
    await stats('/application/send', 'POST');
  } else {
    await option('confirm').check();
    await advance(panel.locator('[data-application-action="submit"]'));
  }
  await panel.locator('[data-application-recruiter-chat="open"]').waitFor();
  const held = await stats();
  const protectedPanel = quiet
    ? held.draft === '' && held.sends === '1' && held.waiting
    : held.draft && held.recruiterSends === 0;
  if (!held.panelOpen || !protectedPanel || (await skip.count())) {
    throw new Error(JSON.stringify(held));
  }
  if (quiet) {
    await stats('/clock/20000', 'POST');
  } else {
    await stats('/draft/clear', 'POST');
    await advance(skip);
  }
  await phase('completed');
  await page.setViewportSize({ width: 390, height: 1440 });
  await page.reload();
  const reason = quiet ? 'quiet' : 'skipped';
  const receipt = panel.locator(
    `[data-application-recruiter-dismissal="${reason}"]`
  );
  await receipt.waitFor();
  await receipt.locator('..').screenshot({ path: 'SCREENSHOT_PATH' });
  const width = await page.evaluate(() => ({
    viewport: globalThis.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  const finished = await stats();
  if (
    finished.panelOpen ||
    !finished.closed ||
    finished.outcomes[0]?.recruiterSends !== 0 ||
    finished.outcomes[0]?.recruiterCloses !== 1 ||
    finished.errors.length ||
    pageErrors.length ||
    width.document > width.viewport
  ) {
    throw new Error(JSON.stringify({ finished, width, pageErrors }));
  }
  return { held, finished, width, pageErrors };
};
