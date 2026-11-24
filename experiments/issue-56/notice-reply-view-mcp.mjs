// Pass this function to Playwright MCP with the loopback fixture port.
async (page, port) => {
  const response = await page.request.get(`http://127.0.0.1:${port}`);
  const fixture = await response.json();
  const context = await page
    .context()
    .browser()
    .newContext({
      viewport: { width: 390, height: 844 },
    });
  try {
    const provider = await context.newPage();
    const errors = [];
    provider.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', (route) =>
      route.request().url() === 'https://hh.ru/chat/7'
        ? route.fulfill({ contentType: 'text/html', body: fixture.html })
        : route.abort()
    );
    await provider.goto('https://hh.ru/chat/7');
    await provider.addStyleTag({
      content:
        '#history { height: 140px; overflow-anchor: none; display: flex; flex-direction: column-reverse; } #history article { box-sizing: border-box; flex: none; min-height: 112px; }',
    });
    const session = await context.newCDPSession(provider);
    await session.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
    await session.detach();
    const owner = await context.newPage();
    await owner.setContent('<textarea>Owner unfinished draft</textarea>');
    await owner.bringToFront();
    const report = await provider.evaluate(
      ({ choice, inactive, spec, text }) => {
        const read = new Function(`return (${choice})`)();
        const ownership = new Function(`return (${inactive})`)();
        const input = {
          spec,
          text,
          token: 'fixture-reply',
          inactiveToken: 'fixture-view',
        };
        const operation = (name) =>
          ownership({ operation: name, token: input.inactiveToken });
        const active = operation('open');
        if (active.state !== 'ready') {
          throw new Error(`Expected an inactive fixture, got ${active.state}`);
        }
        const expected = read({ spec, operation: 'read', preserveDraft: true });
        try {
          const armed = read({ ...input, expected, operation: 'armText' });
          document.querySelector(armed.selector).click();
          const receipt = read({
            ...input,
            expected,
            operation: 'receipt',
            finish: true,
          });
          const sent = document.querySelector(
            '[data-qa="chatik-chat-message-102"] p'
          );
          const pane = document
            .querySelector('#history')
            .getBoundingClientRect();
          const bubble = sent.getBoundingClientRect();
          return {
            receipt,
            text: sent.textContent,
            inPane: bubble.top >= pane.top && bubble.bottom <= pane.bottom,
            inactive: operation('status').state,
            sends: window.textReplyState().sends,
          };
        } finally {
          read({ ...input, expected, operation: 'release' });
          operation('release');
        }
      },
      fixture
    );
    const draft = await owner.locator('textarea').inputValue();
    if (
      !report.receipt.sent ||
      report.receipt.messageId !== '102' ||
      report.receipt.reveal !== 'revealed' ||
      report.text !== fixture.text ||
      !report.inPane ||
      report.inactive !== 'ready' ||
      report.sends !== 1 ||
      draft !== 'Owner unfinished draft' ||
      errors.length
    ) {
      throw new Error(JSON.stringify({ report, draft, errors }));
    }
    await provider.screenshot({
      path: 'docs/screenshots/issue-56/notice-reply-view/reversed-phone.png',
    });
    return { ...report, draftPreserved: true, errors, liveProvider: false };
  } finally {
    await context.close();
  }
};
