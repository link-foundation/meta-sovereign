/* global queueMicrotask */
async (page) => {
  const base = new URL(page.url()).origin;
  const config = await (await page.request.get(`${base}/spec`)).json();
  const context = page.context();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let frame;
  let tail = Promise.resolve();
  await page.exposeBinding('__mcpHistoryCapture', (source, { snapshot }) => {
    if (source.frame !== frame) {
      throw new Error('Foreign fixture frame');
    }
    const work = tail.then(async () => {
      const response = await page.request.post(`${base}/snapshot`, {
        data: snapshot,
      });
      if (!response.ok()) {
        throw new Error('Fixture archive refused');
      }
    });
    tail = work.catch(() => {});
    return work;
  });
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
    frame = page
      .frames()
      .find((item) => item.url() === 'https://chatik.hh.ru/chat/7');
    const control = (operation, token) =>
      frame.evaluate((value) => globalThis.choiceControl(value), {
        spec: config.spec,
        target: '7',
        binding: '__mcpHistoryCapture',
        operation,
        token,
      });
    const opened = await control('observeHistory', 'mcp-live');
    if (opened.code) {
      throw new Error('Fixture capture could not start');
    }
    await frame.evaluate(async () => {
      const row = document.createElement('article');
      row.className = 'chat-bubble_outgoing';
      row.dataset.qa = 'chatik-chat-message-102';
      row.innerHTML =
        '<p data-qa="chat-bubble-text">First answer</p><span data-qa="status-icon-pending"></span>';
      document.querySelector('#history').append(row);
      await new Promise((resolve) => queueMicrotask(resolve));
      row.querySelector('p').textContent = 'Edited answer';
      row.querySelector('span').dataset.qa = 'status-icon-failed';
      await new Promise((resolve) => queueMicrotask(resolve));
      row.querySelector('p').textContent = 'Final answer';
      row.querySelector('span').dataset.qa = 'status-icon-delivered';
      await new Promise((resolve) => queueMicrotask(resolve));
      row.remove();
    });
    const released = await control('releaseHistory', 'mcp-live');
    const saved = await (await page.request.get(`${base}/state`)).json();
    if (
      released.code ||
      saved.body !== 'Final answer' ||
      saved.delivery !== 'delivered' ||
      new Set(saved.versions).size !== 3
    ) {
      throw new Error('Transient fixture versions or delivery were lost');
    }
    await frame.locator('[data-qa="chat-bubble-text"]').evaluate((node) => {
      node.textContent += ' After Stop';
    });
    const stopped = await (await page.request.get(`${base}/state`)).json();
    if (stopped.writes !== saved.writes) {
      throw new Error('Released fixture observer wrote again');
    }
    await control('observeHistory', 'mcp-failure');
    await page.request.post(`${base}/fail`);
    await frame.locator('[data-qa="chat-bubble-text"]').evaluate((node) => {
      node.textContent += ' Refused edit';
    });
    const failed = await control('flushHistory', 'mcp-failure');
    await control('releaseHistory', 'mcp-failure');
    const counts = await frame.evaluate(() => ({
      clicks: window.fixture.clicks,
      text: window.fixture.textSends,
      observer: Boolean(
        window[Symbol.for('meta-sovereign.browser-history-observer.v1')]
      ),
    }));
    if (
      failed.code !== 'question-history-save-failed' ||
      counts.clicks ||
      counts.text ||
      counts.observer ||
      errors.length
    ) {
      throw new Error(
        'Capture failure, cleanup or provider-effect invariant failed'
      );
    }
    return {
      versions: saved.versions,
      delivery: saved.delivery,
      stopDrained: true,
      failedSavePaused: true,
      counts,
      errors,
      liveProvider: false,
    };
  } finally {
    await tail;
    await context.unroute('https://**/*');
  }
};
