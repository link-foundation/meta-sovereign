async (page) => {
  const base = new URL(page.url()).origin;
  const config = await (await page.request.get(`${base}/spec.json`)).json();
  const frameHtml = await (await page.request.get(`${base}/frame`)).text();
  const application = await (
    await page.request.get(`${base}/application`)
  ).text();
  const { resolveBrowserChoiceDocument } = new Function(
    `${config.documentCode}; return ChoiceDocuments;`
  )();
  const context = page.context();
  await context.route('https://**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: new URL(route.request().url()).pathname.startsWith('/chat/')
        ? frameHtml
        : application,
    })
  );
  try {
    await page.goto('https://hh.ru/vacancy/42');
    const frame = page
      .frames()
      .find((value) => value.url() === 'https://chatik.hh.ru/chat/7');
    const held = await resolveBrowserChoiceDocument({}, page, config.spec, '7');
    const evaluate = (input) =>
      held.evaluate({
        fn: (value) => globalThis.choiceControl(value),
        args: [{ spec: config.spec, ...input }],
      });
    const expected = await evaluate({ operation: 'read' });
    const prefill = await evaluate({
      operation: 'prefill',
      expected,
      text: 'Owned review draft',
    });
    if (!prefill.prefilled) {
      throw new Error('Initial guarded prefill failed');
    }
    await frame.evaluate(() => globalThis.mountChoices());
    const choices = await evaluate({ operation: 'history' });
    const retained = await frame.locator('textarea').inputValue();
    if (
      retained !== 'Owned review draft' ||
      !choices.messages[0].strictOptions
    ) {
      throw new Error(
        'Read-only history changed the owned draft or lost choices'
      );
    }
    const strict = await evaluate({ operation: 'read' });
    await frame.locator('textarea').fill('Owner answer to review');
    await frame.locator('article').evaluate((row) => {
      const title = document.createElement('strong');
      title.dataset.qa = 'chat-bubble-title';
      title.textContent = 'Отклик на вакансию';
      row.prepend(title);
    });
    const history = await evaluate({ operation: 'history' });
    const review = await evaluate({ operation: 'read' });
    const refused = await evaluate({
      operation: 'arm',
      expected: strict,
      token: 'history-service',
      option: 'Yes.',
    });
    if (
      !history.messages[0].service ||
      review.code !== 'answer-question-unavailable' ||
      refused.code !== 'answer-choice-changed'
    ) {
      throw new Error('An application bubble reached the answer controls');
    }
    if (
      (await frame.locator('textarea').inputValue()) !==
      'Owner answer to review'
    ) {
      throw new Error('Owner draft changed');
    }
    const counts = await frame.evaluate(() => ({
      clicks: globalThis.fixture.clicks,
      text: globalThis.fixture.textSends,
    }));
    if (counts.clicks || counts.text) {
      throw new Error('Unexpected provider write');
    }
    return {
      history,
      review,
      refused,
      draftPreserved: true,
      readOnlyDraftPreserved: true,
      ...counts,
      liveProvider: false,
    };
  } finally {
    await context.unroute('https://**/*');
  }
};
