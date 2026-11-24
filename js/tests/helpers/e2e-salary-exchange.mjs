import { assert, fulfil } from './e2e-chat.mjs';

export const verifySalaryExchange = async ({ page, salary, run, result }) => {
  const exchange = salary.locator('[data-salary-exchange]');
  await exchange.locator(':scope > summary').click();
  const rate = exchange
    .locator('[data-salary-exchange-rate]')
    .getByLabel('Base units per one currency unit', { exact: true });
  const load = exchange.getByRole('button', {
    name: 'Refresh from Bank of Russia',
    exact: true,
  });
  const cached = exchange.getByRole('button', {
    name: 'Use cached rates',
    exact: true,
  });
  const snapshot = {
    base: 'RUB',
    rates: [{ code: 'USD', rate: 84.9048 }],
    asOf: new Date().toISOString().slice(0, 10),
    source: 'cbr',
    maxAgeDays: 7,
  };
  let mode = 'unavailable';
  let complete;
  let received;
  const pending = new Promise((resolve) => {
    received = resolve;
  });
  const handler = async (route) => {
    if (mode === 'delayed') {
      await new Promise((resolve) => {
        complete = resolve;
        received();
      });
    }
    const value = {
      status:
        mode === 'unavailable'
          ? 'unavailable'
          : mode === 'stale'
            ? 'stale'
            : mode === 'cached'
              ? 'cached'
              : 'updated',
      fresh: mode !== 'stale' && mode !== 'unavailable',
      origin: mode === 'cached' ? 'cache' : 'network',
      exchange:
        mode === 'unavailable'
          ? null
          : {
              ...snapshot,
              ...(mode === 'stale' ? { asOf: '2000-01-01' } : {}),
            },
      fetchedAt: new Date().toISOString(),
      ...(mode === 'cached' ? { warning: 'fetch-failed' } : {}),
    };
    await fulfil(route, value);
  };
  await page.route('**/api/automations/answers/exchange', handler);
  try {
    await cached.click();
    await exchange.locator('[data-salary-rate-result="unavailable"]').waitFor();
    assert(
      (await rate.inputValue()) === '84.9048',
      'a missing cache preserves owner-supplied rates'
    );
    mode = 'delayed';
    await load.click();
    await pending;
    await exchange
      .getByText('Loading exchange rates…', { exact: true })
      .waitFor();
    assert(
      (await load.isDisabled()) && (await cached.isDisabled()),
      'rate refresh prevents duplicate actions'
    );
    await rate.fill('80');
    complete();
    await exchange
      .getByRole('alert')
      .getByText(
        'Exchange settings changed while rates were loading. Your edits are kept; retry to replace them.',
        { exact: true }
      )
      .waitFor();
    assert(
      (await rate.inputValue()) === '80',
      'a delayed response preserves newer manual edits'
    );
    mode = 'updated';
    await load.click();
    await exchange.locator('[data-salary-rate-result="updated"]').waitFor();
    assert(
      (await rate.inputValue()) === '84.9048',
      'the explicit refresh applies the dated primary-source snapshot'
    );
    await rate.fill('81');
    await exchange
      .locator('[data-salary-rate-result]')
      .waitFor({ state: 'detached' });
    mode = 'cached';
    await load.click();
    await exchange.locator('[data-salary-rate-result="cached"]').waitFor();
    await exchange.getByText('Cached rates loaded', { exact: false }).waitFor();
    assert(
      (await exchange.getByLabel('Rate date', { exact: true }).inputValue()) ===
        snapshot.asOf,
      'failed refresh keeps the real publication date'
    );
    mode = 'stale';
    await cached.click();
    await exchange.locator('[data-salary-rate-result="stale"]').waitFor();
    await run();
    await result
      .getByText('Missing profile values: salary_exchange_stale', {
        exact: true,
      })
      .waitFor();
    await result
      .getByText('Review required before automatic sending.', { exact: true })
      .waitFor();
    await captureExchange(
      page,
      exchange,
      process.env.QUESTIONS_EXCHANGE_STALE_SCREENSHOT
    );
    mode = 'updated';
    await load.click();
    await exchange.locator('[data-salary-rate-result="updated"]').waitFor();
    await run();
    await result
      .getByText('From $7 100 gross per month.', { exact: true })
      .waitFor();
    await result.getByText('Approved and complete.', { exact: true }).waitFor();
    await captureExchange(
      page,
      exchange,
      process.env.QUESTIONS_EXCHANGE_SCREENSHOT,
      true
    );
    await exchange.locator(':scope > summary').click();
  } finally {
    complete?.();
    await page.unroute('**/api/automations/answers/exchange', handler);
  }
};

const captureExchange = async (page, exchange, screenshot, mobile = false) => {
  await page.setViewportSize({ width: 1200, height: 1100 });
  await exchange.evaluate((element) =>
    element.scrollIntoView({ block: 'start' })
  );
  if (screenshot) {
    await page.screenshot({ path: screenshot, scale: 'css' });
  }
  if (!mobile) {
    return;
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.app-shell-compact').waitFor();
  await exchange.evaluate((element) =>
    element.scrollIntoView({ block: 'start' })
  );
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth === globalThis.innerWidth
  );
  assert(
    fits,
    'exchange refresh and recovery controls fit the mobile viewport'
  );
  if (process.env.QUESTIONS_EXCHANGE_MOBILE_SCREENSHOT) {
    await page.screenshot({
      path: process.env.QUESTIONS_EXCHANGE_MOBILE_SCREENSHOT,
      scale: 'css',
    });
  }
  await page.setViewportSize({ width: 1200, height: 1100 });
  await page.locator('.app-shell-compact').waitFor({ state: 'detached' });
};
