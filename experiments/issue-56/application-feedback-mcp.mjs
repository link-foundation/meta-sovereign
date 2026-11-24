async (original, fixture) =>
  fixture(
    original,
    async ({ page, panel, action, owner, state, require, errors }) => {
      const vacancies = page.locator('[data-vacancies]');
      await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
      await vacancies.locator('[data-vacancy-action="search"]').click();
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .click();
      await panel.locator('[data-application-missing]').waitFor();
      require(await panel
        .locator('[data-application-option="autoAnswerViewedVacancy"]')
        .isChecked(), 'Default survey policy is absent');
      await panel.screenshot({
        path: 'docs/screenshots/application-feedback-settings-mcp.png',
      });
      await panel
        .locator('[data-application-option="autoSelectResumeLanguage"]')
        .uncheck();
      await action('start').click();
      await state('ready');
      const answered = await owner('feedback-normal', 'POST');
      require(answered.selections === 1 &&
        answered.closes === 1, 'The dedicated survey was not answered');
      const protectedStates = [];
      for (const kind of [
        'owner',
        'challenge',
        'daily-limit',
        'shared-reason',
        'ambiguous',
        'unsafe-close',
      ]) {
        const value = await owner(`feedback-${kind}`, 'POST');
        require(value.selections === 1 &&
          value.closes === 1 &&
          value.challengeReads === 0, `Unowned survey action: ${kind}`);
        if (kind === 'owner') {
          require(value.owner, 'Owner reason was changed');
        }
        protectedStates.push(kind);
      }
      for (const locale of ['ru', 'hi', 'zh', 'en']) {
        await page.evaluate(
          (value) =>
            globalThis.localStorage.setItem('metaSovereignLocale', value),
          locale
        );
        await page.reload();
        await panel
          .locator('[data-application-feedback-policy="automatic"]')
          .waitFor();
        require(!/\bapplication\.[a-z]/iu.test(
          await panel.innerText()
        ), 'Survey settings are untranslated');
      }
      await panel.screenshot({
        path: 'docs/screenshots/application-feedback-after-mcp.png',
      });
      await page.setViewportSize({ width: 390, height: 1440 });
      require(await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ), 'Phone layout overflows');
      await panel.screenshot({
        path: 'docs/screenshots/application-feedback-phone-mcp.png',
      });
      const values = await owner('feedback-values');
      require(values.entries + values.submissions + values.challengeReads ===
        0, 'Survey policy touched application or challenge contents');
      await action('close').click();
      await state('closed');
      const closed = await owner('');
      await page.reload();
      await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
      await vacancies.locator('[data-vacancy-action="search"]').click();
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .waitFor();
      const searched = await owner('');
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .click();
      await state('interrupted');
      const recovered = await owner('');
      require(closed.closed &&
        recovered.closed &&
        searched.opens === recovered.opens &&
        errors.length === 0 &&
        recovered.pageErrors.length ===
          0, 'Owned fixture did not drain or recovery replayed');
      return {
        ...values,
        protectedStates,
        locales: 4,
        phone: true,
        recoveryReplay: false,
        ...recovered,
        errors,
      };
    }
  );
