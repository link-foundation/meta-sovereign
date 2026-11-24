import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';

const now = () => Date.parse('2026-11-09T12:00:00Z');
const xml = (
  date = '10.11.2026'
) => `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="${date}" name="Foreign Currency Market">
<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Dollar</Name><Value>82,7536</Value></Valute>
<Valute ID="R01150"><NumCode>704</NumCode><CharCode>VND</CharCode><Nominal>10000</Nominal><Name>Dong</Name><Value>32,3130</Value></Valute>
</ValCurs>`;
const reply = (body = xml(), status = 200) =>
  new globalThis.Response(body, {
    status,
    headers: { 'content-type': 'text/xml; charset=windows-1251' },
  });

test('CBR XML preserves publication date and divides quoted lots by nominal', async () => {
  const { parseCbrExchange } =
    await import('../src/automation/salary-exchange-feed.js');
  const value = parseCbrExchange(xml());
  assert.equal(value.base, 'RUB');
  assert.equal(value.source, 'cbr');
  assert.equal(value.asOf, '2026-11-10');
  assert.equal(value.rates[0].code, 'USD');
  assert.equal(value.rates[0].rate, 82.7536);
  assert.equal(value.rates[1].code, 'VND');
  assert.ok(Math.abs(value.rates[1].rate - 0.0032313) < 1e-15);
  for (const invalid of [
    xml('31.02.2026'),
    xml().replace('<Nominal>1</Nominal>', '<Nominal>0</Nominal>'),
    xml().replace('32,3130', 'NaN'),
    xml().replace('VND', 'USD'),
    xml().replace('</ValCurs>', ''),
    xml().replace('<CharCode>USD', '<CharCode>USDT'),
    `<!DOCTYPE ValCurs [<!ENTITY payload "unsafe">]>${xml()}`,
  ]) {
    assert.throws(() => parseCbrExchange(invalid));
  }
});

test('explicit refresh uses the fixed primary feed and persists a dated cache', async () => {
  const { salaryExchange, SALARY_EXCHANGE_ID } =
    await import('../src/automation/salary-exchange.js');
  const store = createMemoryStore();
  let called = 0;
  const fetchImpl = async (url, options) => {
    called++;
    assert.equal(url, 'https://www.cbr.ru/scripts/XML_daily.asp');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return reply();
  };
  assert.equal(
    (await salaryExchange(store, {}, { now, fetchImpl })).status,
    'unavailable'
  );
  assert.equal(called, 0);
  const refreshed = await salaryExchange(
    store,
    { refresh: true, maxAgeDays: 1 },
    { now, fetchImpl }
  );
  assert.equal(refreshed.status, 'updated');
  assert.equal(refreshed.fresh, true);
  assert.equal(refreshed.exchange.maxAgeDays, 1);
  assert.equal(called, 1);
  const record = await store.get(SALARY_EXCHANGE_ID);
  assert.equal(record.fetchedAt, '2026-11-09T12:00:00.000Z');
  assert.equal(record.exchange.asOf, '2026-11-10');
  const cached = await salaryExchange(store, {}, { now, fetchImpl });
  assert.equal(cached.status, 'cached');
  assert.equal(called, 1);
});

test('fetch failure recovers the unchanged cache and preserves stale review', async () => {
  const { salaryExchange, SALARY_EXCHANGE_ID } =
    await import('../src/automation/salary-exchange.js');
  const store = createMemoryStore();
  await salaryExchange(
    store,
    { refresh: true },
    { now, fetchImpl: async () => reply() }
  );
  const saved = await store.get(SALARY_EXCHANGE_ID);
  const fetchImpl = async () => {
    throw new Error('fixture offline');
  };
  const recovered = await salaryExchange(
    store,
    { refresh: true },
    { now, fetchImpl }
  );
  assert.equal(recovered.status, 'cached');
  assert.equal(recovered.warning, 'fetch-failed');
  assert.equal(recovered.fresh, true);
  const stale = await salaryExchange(
    store,
    { refresh: true, maxAgeDays: 1 },
    {
      now: () => now() + 4 * 86400000,
      fetchImpl,
    }
  );
  assert.equal(stale.status, 'stale');
  assert.equal(stale.fresh, false);
  assert.equal(stale.exchange.asOf, '2026-11-10');
  assert.deepEqual(await store.get(SALARY_EXCHANGE_ID), saved);
});

test('invalid, future and older feeds cannot replace a valid cached snapshot', async () => {
  const { salaryExchange, SALARY_EXCHANGE_ID } =
    await import('../src/automation/salary-exchange.js');
  const store = createMemoryStore();
  await salaryExchange(
    store,
    { refresh: true },
    { now, fetchImpl: async () => reply() }
  );
  const saved = await store.get(SALARY_EXCHANGE_ID);
  for (const response of [
    reply('<html>unavailable</html>'),
    reply(xml(), 503),
    reply(xml('20.11.2026')),
    reply(xml('08.11.2026')),
  ]) {
    const result = await salaryExchange(
      store,
      { refresh: true },
      { now, fetchImpl: async () => response }
    );
    assert.equal(result.status, 'cached');
    assert.equal(result.fresh, true);
    assert.ok(result.warning);
    assert.deepEqual(await store.get(SALARY_EXCHANGE_ID), saved);
  }
  await assert.rejects(
    salaryExchange(store, { maxAgeDays: 0 }, { now }),
    /maximum age/
  );
});

test(
  'refresh bounds response bytes and aborts a stalled request',
  { timeout: 2000 },
  async () => {
    const { salaryExchange } =
      await import('../src/automation/salary-exchange.js');
    const store = createMemoryStore();
    let cancelled = false;
    const body = new globalThis.ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1048577));
      },
      cancel() {
        cancelled = true;
      },
    });
    const large = await salaryExchange(
      store,
      { refresh: true },
      { now, fetchImpl: async () => new globalThis.Response(body) }
    );
    assert.equal(large.status, 'unavailable');
    assert.equal(cancelled, true);
    let aborted = false;
    const stalled = await salaryExchange(
      store,
      { refresh: true },
      {
        now,
        timeoutMs: 20,
        fetchImpl: (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                aborted = true;
                reject(signal.reason);
              },
              { once: true }
            );
          }),
      }
    );
    assert.equal(stalled.status, 'unavailable');
    assert.equal(aborted, true);
  }
);
