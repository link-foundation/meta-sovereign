import { assert } from './e2e-chat.mjs';
import { SALARY_EXCHANGE_ID } from '../../src/automation/salary-exchange-state.js';
import { CBR_EXCHANGE_URL } from '../../src/automation/salary-exchange-feed.js';

export const verifySalaryExchangePolicy = async ({
  page,
  salary,
  run,
  result,
  store,
}) => {
  const exchange = salary.locator('[data-salary-exchange]');
  await exchange.locator(':scope > summary').click();
  const policy = exchange.getByLabel('Exchange-rate policy', { exact: true });
  assert(
    (await policy.inputValue()) === 'snapshot',
    'existing salary settings retain explicit snapshots'
  );
  const rate = exchange
    .locator('[data-salary-exchange-rate]')
    .getByLabel('Base units per one currency unit', { exact: true });
  const snapshot = {
    base: 'RUB',
    rates: [{ code: 'USD', rate: 84.9048 }],
    asOf: new Date().toISOString().slice(0, 10),
    source: 'cbr',
    maxAgeDays: 7,
  };
  const seed = (value) =>
    store.put({
      id: SALARY_EXCHANGE_ID,
      exchange: value,
      fetchedAt: new Date().toISOString(),
    });
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (url, options) => {
    if (url !== CBR_EXCHANGE_URL) {
      return original(url, options);
    }
    requests++;
    return Promise.reject(new Error('fixture offline'));
  };
  try {
    await seed(snapshot);
    await rate.fill('1');
    await policy.selectOption('cbr');
    await run();
    await result
      .getByText('From $7 100 gross per month.', { exact: true })
      .waitFor();
    await result.locator('[data-salary-automatic-rate="cached"]').waitFor();
    assert(requests === 0, 'fresh automatic cache does not fetch');
    assert(
      (await rate.inputValue()) === '1',
      'automatic mode does not overwrite the saved manual snapshot'
    );
    await seed({ ...snapshot, asOf: '2000-01-01' });
    await run();
    await result.locator('[data-salary-automatic-rate="stale"]').waitFor();
    await result
      .getByText('Missing profile values: salary_exchange_stale', {
        exact: true,
      })
      .waitFor();
    assert(requests === 1, 'stale automatic rates trigger one bounded request');
    await run();
    assert(
      requests === 1,
      'failed automatic refresh backs off across repeated previews'
    );
    await seed(snapshot);
    await policy.selectOption('snapshot');
    await run();
    await result
      .getByText('From $6 900 gross per month.', { exact: true })
      .waitFor();
    await result
      .locator('[data-salary-automatic-rate]')
      .waitFor({ state: 'detached' });
    await rate.fill('84.9048');
    await policy.selectOption('cbr');
    await run();
    await result
      .getByText('From $7 100 gross per month.', { exact: true })
      .waitFor();
    await result.locator('[data-salary-automatic-rate="cached"]').waitFor();
    await capturePolicy(
      page,
      exchange,
      process.env.QUESTIONS_EXCHANGE_POLICY_SCREENSHOT,
      1200,
      1100
    );
    await capturePolicy(
      page,
      exchange,
      process.env.QUESTIONS_EXCHANGE_POLICY_MOBILE_SCREENSHOT,
      390,
      844
    );
    await page.setViewportSize({ width: 1200, height: 1100 });
    await page.locator('.app-shell-compact').waitFor({ state: 'detached' });
    await exchange.locator(':scope > summary').click();
  } finally {
    globalThis.fetch = original;
  }
};

const capturePolicy = async (page, exchange, path, width, height) => {
  await page.setViewportSize({ width, height });
  if (width < 600) {
    await page.locator('.app-shell-compact').waitFor();
  }
  await exchange.evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
    let parent = element.parentElement;
    while (parent && parent.scrollHeight <= parent.clientHeight) {
      parent = parent.parentElement;
    }
    if (parent) {
      parent.scrollTop -= 80;
    }
  });
  const size = await page.evaluate(() => ({
    width: globalThis.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert(
    size.width === size.scroll,
    `exchange policy fits the viewport: ${JSON.stringify(size)}`
  );
  if (path) {
    await page.screenshot({ path, scale: 'css' });
  }
};
