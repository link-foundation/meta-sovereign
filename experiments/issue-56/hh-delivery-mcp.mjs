async (page) => {
  const base = new URL(page.url()).origin;
  const config = await (await page.request.get(`${base}/spec`)).json();
  const context = page.context();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('https://**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        new URL(route.request().url()).hostname === 'chatik.hh.ru'
          ? config.frame
          : config.owner,
    })
  );
  try {
    await page.goto('https://hh.ru/vacancy/42');
    const frame = page
      .frames()
      .find((item) => item.url() === 'https://chatik.hh.ru/chat/7');
    const read = (input) =>
      frame.evaluate((value) => globalThis.choiceControl(value), {
        spec: config.spec,
        ...input,
      });
    const states = [];
    for (const [icons, expected] of [
      [[], 'unknown'],
      [['sending'], 'pending'],
      [['failed'], 'failed'],
      [['unfamiliar'], 'unknown'],
      [['sent', 'failed'], 'unknown'],
      [['sent'], 'sent'],
      [['delivered'], 'delivered'],
      [['read'], 'read'],
    ]) {
      await frame.evaluate((icons) => {
        document.querySelector('[data-qa="chatik-chat-message-102"]')?.remove();
        const row = document.createElement('article');
        row.className = 'chat-bubble_outgoing';
        row.dataset.qa = 'chatik-chat-message-102';
        row.innerHTML = '<p data-qa="chat-bubble-text">Yes.</p>';
        for (const value of icons) {
          const icon = document.createElement('span');
          icon.dataset.qa = `status-icon-${value}`;
          row.append(icon);
        }
        document.querySelector('#history').append(row);
      }, icons);
      const snapshot = await read({ operation: 'history' });
      const reply = snapshot.messages.at(-1);
      if (!reply.outgoing || reply.delivery !== expected) {
        throw new Error(
          'Native delivery observation did not match the fixture'
        );
      }
      states.push(expected);
    }
    await frame.evaluate(() => {
      document.querySelector('[data-qa="chatik-chat-message-102"]').remove();
      window.mountChoices();
      document.querySelector('#choices button').onclick = () => {
        window.fixture.clicks++;
        const row = document.createElement('article');
        row.dataset.qa = 'chatik-chat-message-102';
        row.innerHTML =
          '<p data-qa="chat-bubble-text">Yes.</p><span data-qa="status-icon-sending"></span>';
        document.querySelector('#history').append(row);
      };
    });
    const expected = await read({ operation: 'read' });
    const attempt = { expected, option: 'Yes.', token: 'mcp-native-delivery' };
    const armed = await read({ ...attempt, operation: 'arm' });
    if (!armed.armed) {
      throw new Error('Native choice could not be armed');
    }
    await frame.locator(armed.selector).click();
    const pending = await read({ ...attempt, operation: 'receipt' });
    if (pending.code !== 'send-unknown' || pending.sent) {
      throw new Error('Pending bubble incorrectly confirmed delivery');
    }
    await frame.locator('[data-qa="status-icon-sending"]').evaluate((node) => {
      node.dataset.qa = 'status-icon-read';
    });
    const receipt = await read({
      ...attempt,
      operation: 'receipt',
      finish: true,
    });
    const counts = await frame.evaluate(() => ({
      clicks: window.fixture.clicks,
      text: window.fixture.textSends,
    }));
    if (
      !receipt.sent ||
      receipt.messageId !== '102' ||
      counts.clicks !== 1 ||
      counts.text !== 0 ||
      errors.length
    ) {
      throw new Error(
        'Positive delivery receipt or single-attempt ownership failed'
      );
    }
    return {
      states,
      pendingRefused: true,
      sameAttemptConfirmed: true,
      counts,
      errors,
      liveProvider: false,
    };
  } finally {
    await context.unroute('https://**/*');
  }
};
