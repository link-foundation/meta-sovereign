(class ApplicationDeferralVerification {
  static async verifyDeferred({
    panel,
    action,
    confirm,
    state,
    automatic,
    screenshotPrefix,
    page,
    require,
    owner,
  }) {
    if (automatic) {
      await panel
        .locator('[data-application-option="noQuestionnaires"]')
        .click();
      await state('closed');
      await panel.screenshot({
        path: `docs/screenshots/${screenshotPrefix}-closed.png`,
      });
      const mode = panel.locator(
        '[data-application-option="noQuestionnaires"]'
      );
      require(await mode.isEnabled(), 'Closed review cannot re-enable questionnaires');
      await mode.click();
      await state('interrupted');
    } else {
      require(await action(
        'defer'
      ).isDisabled(), 'Deferral must renew confirmation');
      await confirm();
      await action('defer').click();
      await state('closed');
    }
    await panel.locator('[data-application-queued]').waitFor();
    const stats = await owner('stats');
    require(stats.closed, 'Deferral left an owned browser open');
    require(await action(
      'retry'
    ).isDisabled(), 'Retry must renew confirmation');
    await panel.locator('[data-application-queue]').screenshot({
      path: `docs/screenshots/${screenshotPrefix}-queued.png`,
    });
    await page.reload();
    await panel.locator('[data-application-queued]').waitFor();
    require(await action(
      'retry'
    ).isDisabled(), 'Reload lost confirmation boundary');
    await confirm();
    await action('retry').click();
    await state('review');
    const fresh = await owner('draft-values');
    require(fresh.experience === '' &&
      fresh.letter === null &&
      fresh.entries === 0 &&
      fresh.submissions === 0, 'Queue reopening replayed an action');
    await owner('draft-owner-open-letter', 'POST');
    await action('read').click();
    await state('review');
    await confirm();
    await action('restore').click();
    await panel
      .locator('[data-application-restoration="restored"]')
      .waitFor({ state: 'attached' });
    const result = await owner('draft-values');
    require(result.experience === 'Owner-only questionnaire answer.' &&
      result.letter === 'Actual edited owner letter.' &&
      result.header === 'Owner header' &&
      result.submissions === 0, 'Owner answers or scope were not preserved');
    const intent = await page.evaluate(() =>
      JSON.parse(
        globalThis.localStorage.getItem('meta-sovereign:hh-application-intent')
      )
    );
    require(Object.keys(intent).sort().join(',') ===
      'browserSlot,requestId,url', 'Queue reasons or answers persisted in browser intent');
    await page.setViewportSize({ width: 390, height: 1000 });
    const draft = panel.locator('[data-application-draft]');
    if ((await draft.getAttribute('open')) === null) {
      await draft.locator(':scope > summary').click();
    }
    await draft.screenshot({
      path: `docs/screenshots/${screenshotPrefix}-restored-phone.png`,
    });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Queue panel overflows the phone viewport');
  }
  static async run(originalPage, fixture) {
    return fixture(
      originalPage,
      async ({
        source,
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
        const automatic = source.searchParams.has('automatic');
        const screenshotPrefix =
          source.searchParams.get('screenshot-prefix') ??
          (automatic ? 'application-automatic' : 'application-deferral');
        await start();
        await owner('draft-owner-fill', 'POST');
        await action('read').click();
        await state('review');
        if (before) {
          if (automatic) {
            await panel
              .locator('[data-application-option="noQuestionnaires"]')
              .click();
            await state('deferred');
            const values = await owner('draft-values');
            require(values.experience === 'Owner-only questionnaire answer.' &&
              values.submissions ===
                0, 'Published parent lost the live owner answer');
          } else {
            require((await action('defer').count()) ===
              0, 'Parent unexpectedly has backed deferral');
          }
          await panel.screenshot({
            path: `docs/screenshots/${screenshotPrefix}-before.png`,
          });
        } else {
          await ApplicationDeferralVerification.verifyDeferred({
            panel,
            action,
            confirm,
            state,
            automatic,
            screenshotPrefix,
            page,
            require,
            owner,
          });
        }
        await action('close').click();
        await state('closed');
        require(errors.length === 0, 'Application page errors');
        return {
          parentMissingDeferral: before && !automatic,
          parentKeepsQuestionnaireOpen: before && automatic,
          automaticDeferral: !before && automatic,
          backedQuestionnaire: !before,
          queueSurvivesUiReload: !before,
          retryOnlyReviews: !before,
          restored: before ? 0 : 2,
          submissions: 0,
          identityOnlyIntent: !before,
          pageErrors: errors,
        };
      }
    );
  }
}).run;
