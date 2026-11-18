import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { cvPrepareFixture } from '../../experiments/issue-56/cv-prepare-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';
import { cvPrepareResult } from '../src/jobs/cv-prepare-record.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import {
  createVacancyCommands,
  VACANCY_HELP,
} from '../src/cli/vacancy-commands.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { CvPreparation } from '../src/web/cv-prepare-panel.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';

test('cancelling an unreceived preparation durably refuses the same late POST', async () => {
  const f = await cvPrepareFixture();
  try {
    const input = { requestId: f.input.requestId, browserSlot: 'jobs' };
    assert.equal(typeof f.service['cv-prepare-cancel'], 'function');
    const cancelled = await f.service['cv-prepare-cancel'](input);
    assert.equal(cancelled.preparation.state, 'cancelled');
    assert.equal(cancelled.preparation.providerSaved, false);
    assert.deepEqual(await f.service['cv-prepare'](f.input), cancelled);
    assert.deepEqual(await f.service['cv-prepare-status'](input), cancelled);
    assert.deepEqual(f.calls, { attached: 0, detached: 0, prepared: 0 });
  } finally {
    await f.close();
  }
});

test('cancellation survives restart and refuses a different slot without browser work', async () => {
  const f = await cvPrepareFixture();
  const next = createVacancyService({ store: f.store });
  try {
    const answer = await f.service['cv-prepare-cancel'](f.input);
    assert.deepEqual(await next['cv-prepare'](f.input), answer);
    await assert.rejects(
      next['cv-prepare']({ ...f.input, browserSlot: 'other' }),
      { code: 'jobs-cv-state' }
    );
    assert.deepEqual(f.calls, { attached: 0, detached: 0, prepared: 0 });
  } finally {
    await next.stop();
    await f.close();
  }
});

test('failed cancellation durability stays unconfirmed until a successful explicit retry', async () => {
  const f = await cvPrepareFixture();
  try {
    const flush = f.store.flush;
    f.store.flush = async () => {
      throw new Error('fixture durability failure');
    };
    await assert.rejects(
      f.service['cv-prepare-cancel'](f.input),
      /durability failure/u
    );
    assert.deepEqual(await f.service['cv-prepare-status'](f.input), {
      preparation: null,
    });
    assert.equal(f.calls.attached, 0);
    f.store.flush = flush;
    const confirmed = await f.service['cv-prepare-cancel'](f.input);
    assert.deepEqual(await f.service['cv-prepare'](f.input), confirmed);
  } finally {
    await f.close();
  }
});

test('cancellation drains issued preparation and preserves its actual receipt', async () => {
  const f = await cvPrepareFixture();
  const entered = gate();
  const release = gate();
  try {
    f.prepare(async ({ phase }) => {
      await phase('preparing');
      entered.resolve();
      await release.promise;
    });
    const active = f.service['cv-prepare'](f.input);
    await entered.promise;
    let settled = false;
    const cancelling = f.service['cv-prepare-cancel'](f.input).then(
      (answer) => {
        settled = true;
        return answer;
      }
    );
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(f.calls.detached, 0);
    release.resolve();
    const answer = await active;
    assert.equal(answer.preparation.state, 'prepared');
    assert.deepEqual(await cancelling, answer);
    assert.equal(f.calls.detached, 1);
    assert.deepEqual(await f.service['cv-prepare-cancel'](f.input), answer);
  } finally {
    release.resolve();
    await f.close();
  }
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`cancellation authenticates, flushes and refuses late preparation in ${type}`, async () => {
    const f = await cvPrepareFixture();
    try {
      await withRoutes(async (base) => {
        assert.equal(
          (
            await wirePost(base, 'cv-prepare-cancel', f.input, type, {
              origin: 'https://untrusted.test',
            })
          ).status,
          403
        );
        assert.equal(
          (await fetch(`${base}/api/vacancies/cv-prepare-cancel`)).status,
          405
        );
        const cancelled = await wirePost(
          base,
          'cv-prepare-cancel',
          f.input,
          type
        );
        assert.equal(cancelled.status, 200);
        assert.equal(cancelled.value.preparation.state, 'cancelled');
        const late = await wirePost(base, 'cv-prepare', f.input, type);
        assert.deepEqual(late.value, cancelled.value);
        assert.equal(f.calls.attached, 0);
      }, f.routeOptions);
    } finally {
      await f.close();
    }
  });
}

test('CLI cancellation shares durable recovery and closes its store', async () => {
  const f = await cvPrepareFixture();
  let closes = 0;
  f.store.close = async () => {
    closes++;
  };
  const commands = createVacancyCommands({ openStore: async () => f.store });
  const output = [];
  try {
    assert.equal(
      await commands['vacancies-cv-prepare-cancel'](
        {
          'request-id': f.input.requestId,
          'browser-slot': 'jobs',
        },
        (wire) => output.push(decodeWire(wire))
      ),
      0
    );
    assert.equal(output[0].preparation.state, 'cancelled');
    assert.equal(closes, 1);
    assert.match(VACANCY_HELP, /vacancies-cv-prepare-cancel --request-id/u);
    assert.deepEqual(await f.service['cv-prepare'](f.input), output[0]);
  } finally {
    await f.close();
  }
});

test('client rejects unconfirmed cancellation and reads confirmed tombstones without mutation', async () => {
  const f = await cvPrepareFixture();
  try {
    const answer = await f.service['cv-prepare-cancel'](f.input);
    const api = createVacancyApi({
      get: async () => null,
      local: async () => f.store,
      report: async () => answer,
    });
    assert.deepEqual(await api.vacancyCvPrepareCancel(f.input), answer);
    assert.deepEqual(await api.vacancyCvPrepareStatus(f.input), answer);
    for (const changed of [{ requestId: 'wrong' }, { browserSlot: 'other' }]) {
      await assert.rejects(
        api.vacancyCvPrepareCancel({ ...f.input, ...changed })
      );
    }
    for (const preparation of [
      null,
      { ...answer.preparation, providerSaved: true },
      {
        ...answer.preparation,
        hash: 'b'.repeat(32),
      },
    ]) {
      const bad = createVacancyApi({ report: async () => ({ preparation }) });
      await assert.rejects(bad.vacancyCvPrepareCancel(f.input));
    }
    assert.throws(() =>
      cvPrepareResult({ ...answer.preparation, language: 'en' })
    );
    assert.equal(f.calls.attached, 0);
  } finally {
    await f.close();
  }
});

test('four locales expose pending cancellation and confirmed cancellation without claiming a Save', async () => {
  const f = await cvPrepareFixture();
  try {
    const answer = await f.service['cv-prepare-cancel'](f.input);
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      const render = (state) =>
        renderInLocale(
          locale,
          React.createElement(CvPreparation, {
            state,
            review: f.review,
            idle: true,
            t: (key) => translate(locale, key),
          })
        );
      const pending = render({ ready: false, canCancel: true });
      assert.match(pending, /data-cv-prepare-cancel/u);
      assert.ok(pending.includes(translate(locale, 'cvPrepare.cancel')));
      const cancelled = render({ ready: true, ...answer });
      assert.match(cancelled, /data-cv-preparation-state="cancelled"/u);
      assert.ok(cancelled.includes(translate(locale, 'cvPrepare.cancelled')));
      assert.ok(!cancelled.includes('cvPrepare.'));
    }
  } finally {
    await f.close();
  }
});
