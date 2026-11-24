export const verifyCvPreparationCancellationMcp = async (originalPage) => {
  const source = new URL(originalPage.url());
  const control = source.searchParams.get('control');
  const directory = source.searchParams.get('screenshots');
  await originalPage.goto('about:blank');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const panel = page.locator('[data-cv-preparation]');
  const prepare = panel.locator('[data-cv-prepare-change="en:about"]');
  const cancel = panel.locator('[data-cv-prepare-cancel]');
  const reload = panel.locator('[data-cv-prepare-reload]');
  const ready = () =>
    page.waitForFunction(
      () =>
        document.querySelector('[data-cv-prepare-change="en:about"]')
          ?.disabled === false
    );
  const pendingKey = 'meta-sovereign:cv-preparation:jobs';
  let cancelled;
  let preparationPosts = 0;
  page.on('request', (request) => {
    preparationPosts += Number(
      request.method() === 'POST' && request.url().endsWith('/cv-prepare')
    );
  });
  let cancellationPosts = 0;
  try {
    const pending = await blockUnreceivedPreparation({
      page,
      prepare,
      cancel,
      pendingKey,
      source,
      ready,
    });
    const { requestId } = pending;
    check(await prepare.isDisabled(), 'Unreceived request was forgotten');
    check(
      (await panel.textContent()).includes(requestId),
      'Pending ID is missing'
    );
    await page.route('**/api/vacancies/cv-prepare-cancel', async (route) => {
      cancellationPosts++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"preparation":null}',
      });
    });
    await cancel.click();
    await page.locator('[data-vacancy-error]').waitFor();
    check(
      await prepare.isDisabled(),
      'Malformed acknowledgement released pending guard'
    );
    check(
      (await page.evaluate(
        (key) => globalThis.localStorage.getItem(key),
        pendingKey
      )) === requestId,
      'Malformed reply erased intent'
    );
    await page.unroute('**/api/vacancies/cv-prepare-cancel');
    await page.route('**/api/vacancies/cv-prepare-cancel', async (route) => {
      cancellationPosts++;
      cancelled = await (await route.fetch()).body();
      await route.abort('failed');
    });
    await cancel.click();
    await page.locator('[data-vacancy-error]').waitFor();
    check(
      await prepare.isDisabled(),
      'Lost cancellation reply released pending guard'
    );
    await page.unroute('**/api/vacancies/cv-prepare-cancel');
    await reload.click();
    await panel.locator(`[data-cv-prepare-cancelled="${requestId}"]`).waitFor();
    await ready();
    check(
      (await page.evaluate(
        (key) => globalThis.localStorage.getItem(key),
        pendingKey
      )) === null,
      'Recovered cancellation did not clear pending intent'
    );
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${directory}/cv-prepare-cancel-mcp-desktop.png`,
    });
    const late = await page.request.post(
      `${source.origin}/api/vacancies/cv-prepare`,
      {
        data: pending.original.data,
        headers: {
          'content-type': pending.original.headers['content-type'],
          accept: pending.original.headers.accept,
          origin: source.origin,
        },
      }
    );
    check(
      late.status() === 200 && (await late.body()).equals(cancelled),
      'Late preparation was not the exact cancellation receipt'
    );
    check(
      (await (await page.request.get(control)).json()).attached === 0,
      'Cancellation attached a provider'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.locator('[data-cv-prepare-cancelled]').scrollIntoViewIfNeeded();
    check(
      await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      'Phone cancellation panel overflows'
    );
    await page.screenshot({
      path: `${directory}/cv-prepare-cancel-mcp-phone.png`,
    });
    await reload.focus();
    await page.keyboard.press('Enter');
    await ready();
    await page.reload();
    await ready();
    await panel.locator(`[data-cv-prepare-cancelled="${requestId}"]`).waitFor();
    check(
      preparationPosts === 1 && cancellationPosts === 2,
      'Recovery replayed a mutation'
    );
    await prepare.click();
    await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
    check(errors.length === 0, JSON.stringify(errors));
    return {
      cases: 5,
      preparationPosts,
      cancellationPosts,
      ...(await (await page.request.get(control)).json()),
      errors,
    };
  } finally {
    await context.close();
  }
};

const blockUnreceivedPreparation = async ({
  page,
  prepare,
  cancel,
  pendingKey,
  source,
  ready,
}) => {
  let original;
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${source.origin}/#/cv`);
  await ready();
  await page.route('**/api/vacancies/cv-prepare', (route) => {
    original = {
      data: route.request().postDataBuffer(),
      headers: route.request().headers(),
    };
    return route.abort('failed');
  });
  await prepare.click();
  await page.locator('[data-vacancy-error]').waitFor();
  await page.unroute('**/api/vacancies/cv-prepare');
  const requestId = await page.evaluate(
    (key) => globalThis.localStorage.getItem(key),
    pendingKey
  );
  await page.reload();
  await cancel.waitFor();
  return { original, requestId };
};
