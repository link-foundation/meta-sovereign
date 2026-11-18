import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  startCvFixtureServer,
  cvFixtureRequest,
} from '../../experiments/issue-56/cv-fixture-server.mjs';
import { createCvCommands } from '../src/cli/cv-commands.js';
import { createExperienceApi } from '../src/web/cv-experience-api.js';
import { createExperiencePlanState } from '../src/web/cv-experience-plan-state.js';
import { createExperiencePlanningService } from '../src/cv/experience-plan-service.js';
import {
  experiencePlanFixture,
  settledExperiencePlan,
} from '../../experiments/issue-56/experience-plan-fixture.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';

test(
  'planning API uses private text/binary Lino acknowledgements, trusted mutations and exact immutable revisions',
  { timeout: 10000 },
  async () => {
    const fixture = await experiencePlanFixture();
    const server = await startCvFixtureServer({
      store: fixture.store,
      cv: { experiencePlanning: { adapters: fixture.adapters } },
    });
    const base = `http://127.0.0.1:${server.port}/api/cv/experience/plan-`;
    const request = cvFixtureRequest(base, ['status']);
    try {
      for (const [index, type] of [LINO_TEXT, LINO_BINARY].entries()) {
        const input = fixture.input(`http-plan-${index}`);
        assert.equal(
          (await request('start', type, input, 'https://untrusted.example'))
            .response.status,
          403
        );
        assert.equal(
          (await request('start', type, input)).response.status,
          200
        );
        let result;
        for (let attempt = 0; attempt < 100; attempt++) {
          result = await request('status', type, {
            requestId: input.requestId,
          });
          if (result.row.phase === 'completed') {
            break;
          }
          await delay(1);
        }
        assert.equal(result.row.phase, 'completed');
        assert.equal(result.row.plan.input.hh, input.hh);
        assert.equal(
          result.response.headers.get('cache-control'),
          'private, no-store'
        );
        assert.equal(
          result.response.headers.get('content-type').split(';')[0],
          type
        );
        assert.equal(
          (await request('stop', type, input, 'https://untrusted.example'))
            .response.status,
          403
        );
        assert.equal(
          (await request('stop', type, input)).row.phase,
          'completed'
        );
        const calls = fixture.calls.length;
        await request('status', type, { requestId: input.requestId });
        await request('start', type, input);
        assert.equal(fixture.calls.length, calls);
      }
    } finally {
      await server.close();
    }
  }
);

test(
  'foreground CLI drains its job and closes the store; status uses only the read-only opener',
  { timeout: 10000 },
  async () => {
    const fixture = await experiencePlanFixture();
    let writes = 0;
    let reads = 0;
    let closed = 0;
    fixture.store.close = async () => {
      closed++;
    };
    const commands = createCvCommands({
      openStore: async () => {
        writes++;
        return fixture.store;
      },
      openReadOnly: async () => {
        reads++;
        return fixture.store;
      },
      live: {
        experiencePlanning: {
          adapters: fixture.adapters,
          wait: () => delay(1),
        },
      },
    });
    const input = fixture.input('cli-plan');
    const args = {
      hh: input.hh,
      linkedin: input.linkedin,
      to: input.to,
      'as-of': input.asOf,
      'request-id': input.requestId,
    };
    const output = [];
    assert.equal(
      await commands['cv-experience-plan-start'](args, (text) =>
        output.push(JSON.parse(text))
      ),
      0
    );
    const calls = fixture.calls.length;
    assert.equal(
      await commands['cv-experience-plan-status'](args, (text) =>
        output.push(JSON.parse(text))
      ),
      0
    );
    assert.deepEqual(output[0], output[1]);
    assert.equal(fixture.calls.length, calls);
    assert.deepEqual(
      { writes, reads, closed },
      { writes: 1, reads: 1, closed: 2 }
    );
  }
);

test(
  'lost Start acknowledgements recover with GET only and browser storage contains only an ID',
  { timeout: 10000 },
  async () => {
    const fixture = await experiencePlanFixture();
    const service = createExperiencePlanningService(fixture);
    const memory = new Map();
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage'
    );
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key) => memory.get(key),
        setItem: (key, value) => memory.set(key, value),
        removeItem: (key) => memory.delete(key),
      },
    });
    let starts = 0;
    let scheduled;
    const api = {
      cvExperiencePlanStart: async (input) => {
        starts++;
        await service.start(input);
        throw new Error('Synthetic lost response');
      },
      cvExperiencePlanStatus: (input) => service.status(input),
      cvExperiencePlanStop: (input) => service.stop(input),
    };
    const options = {
      uuid: () => 'web-plan',
      schedule: (work) => {
        scheduled = work;
      },
      cancel: () => {},
    };
    const state = createExperiencePlanState(api, () => {}, options);
    let restored;
    try {
      assert.equal(
        await state.mutate('Start', fixture.input('web-plan')),
        false
      );
      assert.equal(state.state.unknown, true);
      assert.equal(starts, 1);
      await settledExperiencePlan(service, 'web-plan');
      await scheduled();
      assert.equal(state.state.row.phase, 'completed');
      assert.equal(
        await state.mutate('Start', fixture.input('web-plan')),
        false
      );
      assert.deepEqual([...memory.values()], ['web-plan']);
      restored = createExperiencePlanState(api, () => {}, options);
      assert.equal(restored.state.attempted, true);
      await restored.refresh();
      assert.equal(restored.state.row.phase, 'completed');
      assert.equal(starts, 1);
    } finally {
      state.dispose();
      restored?.dispose();
      await service.close();
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      } else {
        delete globalThis.localStorage;
      }
    }
  }
);

test(
  'an old in-flight running receipt cannot replace a drained Stop acknowledgement',
  { timeout: 10000 },
  async () => {
    let entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    let drained = false;
    const fixture = await experiencePlanFixture({
      translate: (_provider, _descriptor, _input, signal) =>
        new Promise((_resolve, reject) => {
          entered();
          signal.addEventListener(
            'abort',
            () => {
              drained = true;
              reject(signal.reason);
            },
            { once: true }
          );
        }),
    });
    const service = createExperiencePlanningService(fixture);
    const input = fixture.input('late-read');
    const running = await service.start(input);
    await started;
    let release;
    const state = createExperiencePlanState(
      {
        cvExperiencePlanStatus: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
        cvExperiencePlanStop: (value) => service.stop(value),
      },
      () => {},
      { uuid: () => input.requestId, schedule: () => {}, cancel: () => {} }
    );
    try {
      const pending = state.refresh();
      assert.equal(await state.mutate('Stop'), true);
      assert.equal(drained, true);
      assert.equal(state.state.row.phase, 'stopped');
      release(running);
      assert.equal(await pending, false);
      assert.equal(state.state.row.phase, 'stopped');
    } finally {
      state.dispose();
      await service.close();
    }
  }
);

test('planning API client refuses missing and negative acknowledgements and never falls back to starting a request', async () => {
  const calls = [];
  const api = createExperienceApi({
    get: async (url) => {
      calls.push(url);
      return undefined;
    },
    report: async () => ({ ok: false, httpStatus: 503 }),
  });
  await assert.rejects(api.cvExperiencePlanStatus({ requestId: 'missing' }));
  await assert.rejects(api.cvExperiencePlanStart({ requestId: 'refused' }));
  await assert.rejects(api.cvExperiencePlanStop({ requestId: 'refused' }));
  assert.deepEqual(calls, ['/api/cv/experience/plan-status?requestId=missing']);
});
