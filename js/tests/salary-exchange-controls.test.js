import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { startServer } from '../src/server/index.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import {
  salaryExchange,
  SALARY_EXCHANGE_ID,
} from '../src/automation/salary-exchange.js';
import { CBR_EXCHANGE_URL } from '../src/automation/salary-exchange-feed.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const date = new Date().toISOString().slice(0, 10);
const xml = `<ValCurs Date="${date.split('-').reverse().join('.')}"><Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>84,9048</Value></Valute></ValCurs>`;
const withFeed = async (run) => {
  const original = globalThis.fetch;
  let calls = 0;
  let fail = false;
  globalThis.fetch = (url, options) => {
    if (url !== CBR_EXCHANGE_URL) {
      return original(url, options);
    }
    calls++;
    if (fail) {
      return Promise.reject(new Error('fixture offline'));
    }
    return Promise.resolve(new globalThis.Response(xml));
  };
  try {
    await run({
      calls: () => calls,
      fail: () => {
        fail = true;
      },
    });
  } finally {
    globalThis.fetch = original;
  }
};

test(
  'CLI refresh is explicit and cached reads preserve the publication date',
  { timeout: 10000 },
  async () => {
    await withFeed(async ({ calls, fail }) => {
      const store = createMemoryStore();
      const cli = createAutomationCommands({ openStore: async () => store });
      const output = [];
      const run = async (flags = {}) => {
        assert.equal(
          await cli.automations(
            { _: ['answers', 'exchange'], json: true, ...flags },
            (line) => output.push(line)
          ),
          0
        );
        return JSON.parse(output.at(-1));
      };
      assert.equal((await run()).status, 'unavailable');
      assert.equal(calls(), 0);
      const updated = await run({ refresh: 'true', 'max-age-days': '2' });
      assert.equal(updated.status, 'updated');
      assert.equal(updated.exchange.asOf, date);
      assert.equal(updated.exchange.maxAgeDays, 2);
      assert.equal((await run({ refresh: 'false' })).status, 'cached');
      assert.equal(calls(), 1);
      fail();
      const fallback = await run({ refresh: true });
      assert.equal(fallback.status, 'cached');
      assert.equal(fallback.warning, 'fetch-failed');
      assert.equal(fallback.exchange.asOf, date);
    });
  }
);

test(
  'text and binary Lino expose refresh, fallback and validation without altering saved answers',
  { timeout: 20000 },
  async () => {
    await withFeed(async ({ calls, fail }) => {
      const store = createMemoryStore();
      const automation = {
        id: 'automation:unchanged',
        action: { kind: 'answer-questions', salary: { approved: true } },
      };
      await store.put(automation);
      const server = await startServer({
        store,
        enableSync: false,
        enableHandlers: false,
        automations: { scheduler: false },
      });
      const url = `http://127.0.0.1:${server.port}/api/automations/answers/exchange`;
      try {
        for (const type of [LINO_TEXT, LINO_BINARY]) {
          const call = async (input) => {
            const response = await fetch(url, {
              method: input ? 'POST' : 'GET',
              headers: { accept: type, 'content-type': type },
              ...(input ? { body: encodeWire(input, type) } : {}),
            });
            return {
              status: response.status,
              body: await readWireResponse(response),
            };
          };
          const before = calls();
          await call();
          assert.equal(calls(), before);
          const updated = await call({ refresh: true });
          assert.equal(updated.status, 200);
          assert.equal(updated.body.status, 'updated');
          assert.equal(updated.body.exchange.asOf, date);
          assert.equal((await call({ maxAgeDays: 0 })).status, 400);
          assert.deepEqual(await store.get(automation.id), automation);
        }
        const saved = await store.get(SALARY_EXCHANGE_ID);
        fail();
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': LINO_TEXT },
          body: encodeWire({ refresh: true }, LINO_TEXT),
        });
        const recovered = await readWireResponse(response);
        assert.equal(recovered.status, 'cached');
        assert.equal(recovered.warning, 'fetch-failed');
        assert.deepEqual(await store.get(SALARY_EXCHANGE_ID), saved);
      } finally {
        await server.close();
      }
    });
  }
);

test(
  'offline web controls use the shared cache and retain it after a remote refusal',
  { timeout: 10000 },
  async () => {
    await withFeed(async ({ calls }) => {
      const store = createMemoryStore();
      await salaryExchange(store, { refresh: true });
      const saved = await store.get(SALARY_EXCHANGE_ID);
      const api = questionApi({
        store,
        remote: {
          report: async (_path, input, options) => {
            assert.equal(options.read, input.refresh !== true);
            return null;
          },
        },
      });
      const result = await api.salaryExchange();
      assert.equal(result.status, 'cached');
      assert.equal(result.exchange.asOf, date);
      assert.equal(calls(), 1);
      const refused = questionApi({
        store,
        remote: {
          report: async () => ({ status: 'failed', error: 'fixture refusal' }),
        },
      });
      await assert.rejects(
        refused.salaryExchange({ refresh: true }),
        /fixture refusal/
      );
      assert.equal(calls(), 1);
      assert.deepEqual(await store.get(SALARY_EXCHANGE_ID), saved);
    });
  }
);

test('failed cache persistence never reports an updated snapshot', async () => {
  const store = {
    get: async () => null,
    put: async () => {
      throw new Error('fixture write refused');
    },
  };
  await assert.rejects(
    salaryExchange(
      store,
      { refresh: true },
      { fetchImpl: async () => new globalThis.Response(xml) }
    ),
    /fixture write refused/
  );
});
