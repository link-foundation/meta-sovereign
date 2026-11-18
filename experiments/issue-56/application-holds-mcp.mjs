(class ApplicationHoldVerification {
  static async verifyHeld({
    page,
    panel,
    owner,
    require,
    values,
    state,
    confirm,
    action,
  }) {
    require(values.experience === 'Five years building Python services.' &&
      values.header === 'Owner header', 'Native owner scope changed');
    await panel.locator('[data-application-option="noQuestionnaires"]').click();
    await state('deferred');
    const stats = await owner('stats');
    require(!stats.closed, 'Held questionnaire was automatically closed');
    await panel.locator('[data-application-option="noQuestionnaires"]').click();
    await state('review');
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (locale) =>
          globalThis.localStorage.setItem('metaSovereignLocale', locale),
        locale
      );
      await page.reload();
      require((await page.evaluate(() =>
        globalThis.localStorage.getItem('metaSovereignLocale')
      )) === locale, 'Locale reset during reload');
      await panel.locator('[data-application-hold="verification"]').waitFor();
      require(!(await panel.innerText()).includes(
        'application.hold'
      ), 'Untranslated hold');
      require((await owner('hold-values')).submissions ===
        0, 'UI recovery replayed send');
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await panel
      .locator('[data-application-hold]')
      .screenshot({ path: 'docs/screenshots/application-holds-phone.png' });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Hold overflows phone');
    await confirm();
    await action('submit').click();
    await state('delivered');
    require((await panel.locator('[data-application-hold]').count()) ===
      0, 'Confirmed delivery did not clear hold');
  }
  static async run(originalPage, fixture) {
    return fixture(
      originalPage,
      async ({
        before,
        page,
        errors,
        require,
        owner,
        panel,
        action,
        state,
        confirm,
        start,
      }) => {
        await start(async (panel) => {
          await panel.locator('[data-application-option="autoExact"]').check();
          await panel.locator('[data-application-delay]').fill('0');
        });
        await owner('hold-show', 'POST');
        await action('read').click();
        await state('verification');
        await owner('hold-dismiss', 'POST');
        await action('read').click();
        await state('review');
        await confirm();
        const prefillResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname ===
              '/api/vacancies/application-prefill'
        );
        await action('prefill').click();
        await (await prefillResponse).finished();
        await panel
          .locator('[data-application-action="read"]:not([disabled])')
          .waitFor();
        await state(before ? 'delivered' : 'review');
        const values = await owner('hold-values');
        require(values.submissions ===
          (before ? 1 : 0), 'Unexpected application dispatch count');
        await panel.screenshot({
          path: `docs/screenshots/application-holds-${before ? 'before' : 'held'}.png`,
        });
        if (!before) {
          await ApplicationHoldVerification.verifyHeld({
            page,
            panel,
            owner,
            require,
            values,
            state,
            confirm,
            action,
          });
        }
        await action('close').click();
        await state('closed');
        require((await owner('stats'))
          .closed, 'Owned native browser remained open');
        require(errors.length === 0, 'Page errors');
        return {
          exactParentSentAfterDismissal: before,
          manualHoldRetained: !before,
          fourLocaleRecovery: !before,
          automaticClosureHeld: !before,
          submissionsBeforeManualConfirmation: before ? 1 : 0,
          pageErrors: errors,
        };
      }
    );
  }
}).run;
