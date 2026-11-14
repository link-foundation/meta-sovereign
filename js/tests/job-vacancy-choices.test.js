import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';
import {
  vacancyChoiceResult,
  vacancyChoiceId,
} from '../src/jobs/vacancy-choice.js';
import { privateSyncId } from '../src/sync/reconcile-records.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import {
  vacancyUrl,
  gate,
} from '../../experiments/issue-56/vacancy-fixture.mjs';
import { VacancyChoices } from '../src/web/vacancy-choices.js';
import React from 'react';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';

const input = (revision = 'empty', more = {}) => ({
  browserSlot: 'jobs',
  url: vacancyUrl,
  title: 'Engineer',
  state: 'deferred',
  note: 'Ask about the schedule.',
  revision,
  ...more,
});
const make = (store = createMemoryStore()) => ({
  store,
  service: createVacancyService({
    store,
    openSession: async () => {
      assert.fail('Local choices must not launch a browser');
    },
  }),
});

test(
  'acknowledged private choices reopen from an actual durable store',
  { timeout: 5000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'ms-vacancy-choice-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    let receipt;
    for (const reopen of [false, true]) {
      const store = await createLinoTextStore(join(directory, 'choices.lino'));
      const { service } = make(store);
      try {
        if (reopen) {
          assert.deepEqual(await service['choices-stored']({}), receipt);
        } else {
          receipt = await service['choice-save'](input());
        }
      } finally {
        await service.stop();
        await store.close();
      }
    }
  }
);

test('owner vacancy choices survive service restart, remain private and isolate named slots', async () => {
  const { store, service } = make();
  const first = await service['choice-save'](input());
  assert.equal(first.entries[0].state, 'deferred');
  assert.equal(privateSyncId(vacancyChoiceId('jobs')), true);
  await service.stop();
  const restarted = make(store).service;
  try {
    assert.deepEqual(await restarted['choices-stored']({}), first);
    assert.deepEqual(
      (await restarted['choices-stored']({ browserSlot: 'other' })).entries,
      []
    );
    const second = await restarted['choice-save'](
      input(first.revision, { state: 'skipped' })
    );
    assert.notEqual(second.revision, first.revision);
    assert.equal(second.entries[0].note, input().note);
    assert.equal((await store.query()).length, 1);
  } finally {
    await restarted.stop();
  }
});

test('stale or missing revisions cannot overwrite or resurrect cleared owner choices', async () => {
  const { service } = make();
  try {
    const first = await service['choice-save'](input());
    await assert.rejects(service['choice-save'](input()), {
      code: 'jobs-choice-conflict',
    });
    const cleared = await service['choice-clear'](input(first.revision));
    assert.deepEqual(cleared.entries, []);
    assert.notEqual(cleared.revision, 'empty');
    await assert.rejects(service['choice-save'](input(first.revision)), {
      code: 'jobs-choice-conflict',
    });
    await assert.rejects(service['choice-save'](input()), {
      code: 'jobs-choice-conflict',
    });
    assert.throws(() =>
      service['choice-save'](input(undefined, { revision: undefined }))
    );
    assert.deepEqual(await service['choices-stored']({}), cleared);
  } finally {
    await service.stop();
  }
});

test('invalid and foreign choice records cannot enter or leave the service', async () => {
  const { store, service } = make();
  try {
    for (const bad of [
      null,
      [],
      input('bad'),
      input('empty', { state: 'sent' }),
      input('empty', { url: 'https://hh.ru.evil.test/vacancy/123' }),
      input('empty', { browserSlot: '../other' }),
      input('empty', { note: 'x'.repeat(4001) }),
      input('empty', { title: '' }),
    ]) {
      assert.throws(() => service['choice-save'](bad));
    }
    assert.deepEqual(await store.query(), []);
    const saved = await service['choice-save'](input());
    for (const bad of [
      { ...saved, version: 2 },
      { ...saved, browserSlot: 'other' },
      { ...saved, revision: 'empty' },
      { ...saved, entries: [saved.entries[0], saved.entries[0]] },
      { ...saved, entries: [{ ...saved.entries[0], updatedAt: 'invalid' }] },
    ]) {
      assert.throws(() => vacancyChoiceResult(bad));
    }
    await store.put({
      id: vacancyChoiceId('jobs'),
      ...saved,
      browserSlot: 'other',
    });
    await assert.rejects(service['choices-stored']({}), {
      code: 'jobs-choice-state',
    });
  } finally {
    await service.stop();
  }
});

test(
  'choice readers and Stop drain a held failed flush before exposing the previous snapshot',
  { timeout: 3000 },
  async () => {
    const { store, service } = make();
    const first = await service['choice-save'](input());
    const started = gate(),
      release = gate();
    const error = new Error('fixture persistence failure');
    store.flush = async () => {
      started.resolve();
      await release.promise;
      throw error;
    };
    const write = service['choice-save'](
      input(first.revision, { state: 'skipped' })
    );
    const rejected = assert.rejects(write, (failure) => failure === error);
    await started.promise;
    let readDone = false,
      stopped = false;
    const read = service['choices-stored']({}).then((value) => {
      readDone = true;
      return value;
    });
    const stopping = service.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    assert.equal(readDone, false);
    assert.equal(stopped, false);
    release.resolve();
    await Promise.all([rejected, stopping]);
    assert.deepEqual(await read, first);
    await assert.rejects(service['choice-save'](input(first.revision)), {
      code: 'jobs-stopped',
    });
  }
);

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `local choices have guarded shared routes over ${type}`,
    { timeout: 5000 },
    async () => {
      await withRoutes(async (base, calls) => {
        const first = await wirePost(
          base,
          'choice-save',
          input('empty', {
            title: '職'.repeat(500),
            note: '問'.repeat(4000),
          }),
          type
        );
        assert.equal(first.status, 200);
        const response = await fetch(
          `${base}/api/vacancies/choices-stored?browserSlot=jobs`,
          { headers: { accept: type } }
        );
        assert.deepEqual(
          decodeWire(
            await response.arrayBuffer(),
            response.headers.get('content-type')
          ),
          first.value
        );
        const stale = await wirePost(base, 'choice-clear', input(), type);
        assert.equal(stale.status, 409);
        const foreign = await wirePost(
          base,
          'choice-clear',
          input(first.value.revision),
          type,
          { origin: 'https://foreign.test' }
        );
        assert.equal(foreign.status, 403);
        const cleared = await wirePost(
          base,
          'choice-clear',
          input(first.value.revision),
          type
        );
        assert.deepEqual(cleared.value.entries, []);
        assert.equal(calls.length, 0);
      });
    }
  );
}

test('CLI round-trips revisioned saved owner choices without opening a browser', async () => {
  const { store } = make();
  const commands = createVacancyCommands({ openStore: async () => store });
  const output = [];
  const log = (value) => output.push(decodeWire(value));
  const flags = { ...input(), 'browser-slot': 'owner' };
  assert.equal(await commands['vacancies-choice-save'](flags, log), 0);
  assert.equal(
    await commands['vacancies-choices-stored'](
      { 'browser-slot': 'owner' },
      log
    ),
    0
  );
  assert.deepEqual(output[0], output[1]);
  assert.equal(output[0].browserSlot, 'owner');
  assert.equal(
    await commands['vacancies-choice-clear'](
      { ...flags, revision: output[0].revision },
      log
    ),
    0
  );
  assert.deepEqual(output[2].entries, []);
});

test('a full owner registry refuses new entries without dropping previous choices', async () => {
  const { store, service } = make();
  const first = await service['choice-save'](input());
  const entries = Array.from({ length: 1000 }, (_, index) => ({
    ...first.entries[0],
    url: `https://hh.ru/vacancy/${index + 1}`,
  }));
  await store.put({ id: vacancyChoiceId('jobs'), ...first, entries });
  try {
    await assert.rejects(
      service['choice-save'](
        input(first.revision, {
          url: 'https://hh.ru/vacancy/1001',
        })
      ),
      { code: 'jobs-choice-capacity' }
    );
    assert.deepEqual((await service['choices-stored']({})).entries, entries);
    assert.throws(
      () =>
        vacancyChoiceResult({
          ...first,
          entries: entries
            .slice(0, 251)
            .map((row) => ({ ...row, note: '問'.repeat(4000) })),
        }),
      { code: 'jobs-choice-capacity' }
    );
  } finally {
    await service.stop();
  }
});

test('browser API refuses a false receipt and keeps offline choices read-only', async () => {
  const { store, service } = make();
  const saved = await service['choice-save'](input());
  await service.stop();
  let answer = saved;
  const api = createVacancyApi({
    get: async () => null,
    report: async () => answer,
    local: async () => store,
  });
  assert.deepEqual(await api.vacancyChoicesStored({}), saved);
  answer = { ok: true };
  await assert.rejects(api.vacancyChoiceSave(input(saved.revision)));
  answer = { ...saved, browserSlot: 'foreign' };
  await assert.rejects(api.vacancyChoiceSave(input(saved.revision)));
});

test('owner-choice controls show private notes, explicit recovery and local scope in four locales', () => {
  const entry = { ...input(), updatedAt: new Date().toISOString() };
  const state = {
    values: { browserSlot: 'jobs' },
    busy: '',
    browserValid: true,
    capabilities: { localChoices: true },
    choices: {
      ready: true,
      failed: false,
      snapshot: { browserSlot: 'jobs', entries: [entry] },
      change() {},
      reload() {},
    },
  };
  for (const locale of ['en', 'ru', 'zh', 'hi']) {
    const html = renderInLocale(
      locale,
      React.createElement(VacancyChoices, {
        state,
        t: (key, values) => translate(locale, key, values),
      })
    );
    assert.match(html, /data-vacancy-choices="jobs"/u);
    assert.ok(html.includes(entry.note));
    assert.match(html, /data-vacancy-choice-action="clear"/u);
    assert.doesNotMatch(html, />vacancyChoice\./u);
  }
});
