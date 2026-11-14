(class SupervisedApplicationVerification {
  static async confirmed(tools, name) {
    const { confirm, action, page } = tools;
    await confirm();
    await action(name).click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-application-option="confirm"]')
          .checked &&
        !document.querySelector('[data-application-action="read"]').disabled
    );
  }
  static async locales(tools) {
    const { page, panel, action, require } = tools;
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (value) =>
          globalThis.localStorage.setItem('metaSovereignLocale', value),
        locale
      );
      await page.reload();
      await panel.locator('[data-application-supervised]').waitFor();
      require(!(await panel.innerText()).includes(
        'application.supervised'
      ), 'Preset hint is untranslated');
      require(await action(
        'letter'
      ).isDisabled(), 'Locale recovery reused confirmation');
    }
  }
  static async run(originalPage, fixture) {
    return fixture(originalPage, async (tools) => {
      const {
        start,
        panel,
        action,
        owner,
        require,
        page,
        errors,
        state,
        confirm,
      } = tools;
      await start(async () => {
        await panel
          .locator('[data-application-letter]')
          .fill('Independent supervised owner letter.');
        await panel.locator('[data-application-option="autoExact"]').check();
        await panel.locator('[data-application-option="supervised"]').check();
        require(await panel
          .locator('[data-application-option="autoExact"]')
          .isDisabled(), 'Automatic sending stayed enabled');
      });
      require((await action('prefill').count()) ===
        0, 'Combined prefill exposed in supervised review');
      await SupervisedApplicationVerification.confirmed(tools, 'answers');
      let values = await owner('draft-values');
      require(values.experience === 'Five years building Python services.' &&
        values.letter === null &&
        values.submissions === 0, 'Answer step combined effects');
      await SupervisedApplicationVerification.locales(tools);
      await panel.screenshot({
        path: 'docs/screenshots/application-supervised-answers.png',
      });
      await SupervisedApplicationVerification.confirmed(tools, 'letter');
      values = await owner('draft-values');
      require(values.letter === 'Independent supervised owner letter.' &&
        values.submissions === 0, 'Letter step sent or lost owner text');
      require(await action(
        'submit'
      ).isDisabled(), 'Letter step reused send confirmation');
      await panel.screenshot({
        path: 'docs/screenshots/application-supervised-letter.png',
      });
      await page.setViewportSize({ width: 390, height: 1100 });
      require(await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ), 'Supervised controls overflow phone');
      await panel.screenshot({
        path: 'docs/screenshots/application-supervised-phone.png',
      });
      await confirm();
      await action('submit').click();
      await state('delivered');
      values = await owner('draft-values');
      require(values.entries === 1 &&
        values.submissions ===
          1, 'Expected one native application entry and submission');
      await action('close').click();
      await state('closed');
      const stats = await owner('stats');
      require(stats.closed &&
        stats.pageErrors.length === 0 &&
        errors.length === 0, 'Owned supervised browser did not drain');
      return {
        separatelyConfirmedAnswers: true,
        separatelyConfirmedLetter: true,
        manualDelivery: true,
        fourLocaleRecovery: true,
        phoneOverflow: false,
        browsersClosed: stats.closed,
        pageErrors: errors,
      };
    });
  }
}).run;
