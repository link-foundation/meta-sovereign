(class ApplicationRetryVerification {
  static async queue({ action, panel }) {
    await action('queue').click();
    await panel.locator('[data-application-retry-at]').waitFor();
  }
  static async waiting(tools) {
    const { page, panel, action, confirm, owner, require } = tools;
    await ApplicationRetryVerification.queue(tools);
    await confirm();
    require(await action('retry').isDisabled(), 'Early retry became writable');
    await panel
      .locator('[data-application-queue]')
      .screenshot({ path: 'docs/screenshots/application-retries-waiting.png' });
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (locale) =>
          globalThis.localStorage.setItem('metaSovereignLocale', locale),
        locale
      );
      await page.reload();
      await ApplicationRetryVerification.queue(tools);
      require((await page.evaluate(() =>
        globalThis.localStorage.getItem('metaSovereignLocale')
      )) === locale, 'Locale reset');
      require(!(await panel.innerText()).includes(
        'application.retry'
      ), 'Untranslated retry controls');
      require(await action('retry').isDisabled(), 'Reload enabled early retry');
      require((await owner('retry-stats')).rejections ===
        1, 'Reload replayed the rejected send');
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await panel
      .locator('[data-application-queue]')
      .screenshot({ path: 'docs/screenshots/application-retries-phone.png' });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Retry controls overflow phone');
    await page.setViewportSize({ width: 1280, height: 1100 });
  }
  static async due(tools) {
    const { owner, action, confirm, state, require, panel } = tools;
    await owner('retry-advance', 'POST');
    await ApplicationRetryVerification.queue(tools);
    require(await action(
      'retry'
    ).isDisabled(), 'Fresh retry lacks a separate confirmation');
    await confirm();
    await action('retry').click();
    await state('review');
    let values = await owner('draft-values');
    require(values.experience === '' &&
      values.letter === null &&
      values.entries === 0 &&
      values.submissions === 0, 'Reopening filled or sent automatically');
    require(await action(
      'submit'
    ).isDisabled(), 'Reopening retained send confirmation');
    await owner('draft-owner-open-letter', 'POST');
    await action('read').click();
    await state('review');
    await confirm();
    await action('restore').click();
    await panel
      .locator('[data-application-restoration="restored"]')
      .waitFor({ state: 'attached' });
    await panel.locator('[data-application-draft] summary').click();
    values = await owner('draft-values');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.letter === 'Actual edited owner letter.' &&
      values.header === 'Owner header' &&
      values.submissions === 0, 'Restoration lost owner values or sent');
    require(await action(
      'submit'
    ).isDisabled(), 'Restoration retained send confirmation');
    await panel.screenshot({
      path: 'docs/screenshots/application-retries-restored.png',
    });
    await confirm();
    await action('submit').click();
    await state('delivered');
    require((await owner('retry-stats')).rejections ===
      1, 'Unexpected rejection count');
    await action('close').click();
    await state('closed');
  }
  static async run(originalPage, fixture) {
    return fixture(originalPage, async (tools) => {
      const {
        before,
        owner,
        action,
        confirm,
        state,
        panel,
        require,
        errors,
        start,
      } = tools;
      await start();
      await owner('draft-owner-fill', 'POST');
      await action('read').click();
      await state('review');
      await owner('retry-reject-next', 'POST');
      await confirm();
      await action('submit').click();
      await state(before ? 'provider-error' : 'closed');
      require((await owner('retry-stats')).rejections ===
        1, 'No actual native rejection observed');
      if (before) {
        const values = await owner('draft-values');
        require(values.experience === 'Owner-only questionnaire answer.' &&
          values.submissions === 1, 'Parent native rejection evidence missing');
        await panel.screenshot({
          path: 'docs/screenshots/application-retries-before.png',
        });
        await action('close').click();
        await state('closed');
      } else {
        require((await owner('stats'))
          .closed, 'Backed rejected form remained open');
        await ApplicationRetryVerification.waiting(tools);
        await ApplicationRetryVerification.due(tools);
      }
      require((await owner('stats')).closed &&
        errors.length === 0, 'Fixture did not drain cleanly');
      return {
        exactParentMissingQueue: before,
        backedFiveHourWait: !before,
        freshReviewOnly: !before,
        separateRestoreAndSend: !before,
        fourLocales: !before,
        rejections: 1,
        browsersClosed: true,
        pageErrors: errors,
      };
    });
  }
}).run;
