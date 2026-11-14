async (page, fixture) =>
  fixture(
    page,
    async ({ page, panel, action, state, owner, require, errors, locales }) => {
      const vacancies = page.locator('[data-vacancies]');
      await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
      await vacancies.locator('[data-vacancy-action="search"]').click();
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .click();
      await panel.locator('[data-application-missing]').waitFor();
      await panel
        .locator('[data-application-option="autoSelectResumeLanguage"]')
        .uncheck();
      await panel.locator('[data-application-option="pacing"]').check();
      await panel.locator('[data-application-pacing-interval]').fill('17');
      await action('start').click();
      await state('ready');
      await action('queue').click();
      await panel.locator('[data-application-pacing="waiting"]').waitFor();
      require((await panel.innerText()).includes(
        '17'
      ), 'The fixed interval is absent.');
      await action('close').click();
      await state('closed');
      await action('release').click();
      require(await action(
        'start'
      ).isDisabled(), 'A new review bypassed the saved window.');
      await locales('pacing', 'start');
      await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
      await vacancies.locator('[data-vacancy-action="search"]').click();
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .click();
      await state('interrupted');
      await action('release').click();
      await page.setViewportSize({ width: 390, height: 1440 });
      require(await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ), 'Phone layout overflows.');
      const beforeExpiry = await owner('');
      await owner('pace-expire', 'POST');
      await action('queue').click();
      await panel.locator('[data-application-pacing="ready"]').waitFor();
      require(await action(
        'start'
      ).isEnabled(), 'Explicit refresh did not expose eligibility.');
      const stats = await owner('');
      require(stats.opens === beforeExpiry.opens &&
        stats.closed &&
        stats.providerClicks === 0 &&
        !stats.liveProvider, 'Pacing created provider work.');
      require(errors.length === 0 &&
        stats.pageErrors.length === 0, 'The fixture reported a page error.');
      return {
        fixedSeconds: 17,
        locales: 4,
        phone: true,
        expiryOpened: false,
        ...stats,
        errors,
      };
    }
  );
