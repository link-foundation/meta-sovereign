import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import React from 'react';
import {
  createVacancyCommands,
  VACANCY_HELP,
} from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { CvSaveWatch } from '../src/web/cv-watch-panel.js';
import { translate } from '../src/web/i18n.js';
import { renderInLocale } from './util-render.js';
import { decodeWire, LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { cvWatchFixture } from '../../experiments/issue-56/cv-watch-fixture.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`CV observation routes authenticate start/Stop and recover only by GET in ${type}`, async () => {
    const f = cvWatchFixture();
    const input = {
      requestId: randomUUID(),
      browserSlot: 'jobs',
      durationMs: 1000,
    };
    try {
      await withRoutes(
        async (base) => {
          assert.equal(
            (
              await wirePost(base, 'cv-watch', input, type, {
                origin: 'https://untrusted.test',
              })
            ).status,
            403
          );
          const started = await wirePost(base, 'cv-watch', input, type);
          assert.equal(started.status, 200);
          assert.equal(started.value.watch.active, true);
          const response = await fetch(
            `${base}/api/vacancies/cv-watch-status?browserSlot=jobs`,
            { headers: { accept: type } }
          );
          assert.equal(
            decodeWire(
              await response.arrayBuffer(),
              response.headers.get('content-type')
            ).watch.requestId,
            input.requestId
          );
          assert.equal(
            (await fetch(`${base}/api/vacancies/cv-watch`)).status,
            405
          );
          const stopped = await wirePost(base, 'cv-watch-stop', input, type);
          assert.equal(stopped.value.watch.active, false);
          assert.equal(stopped.value.watch.state, 'stopped');
          assert.deepEqual(f.counts(), { attached: 1, detached: 1, reads: 0 });
        },
        { store: f.store, service: { cvWatch: f.options.cvWatch } }
      );
    } finally {
      await f.service.stop();
    }
  });
}
test('foreground CV watch CLI drains at finite expiry and status/snapshots never reattach', async () => {
  const f = cvWatchFixture();
  let closes = 0;
  f.store.close = async () => {
    closes++;
  };
  const commands = createVacancyCommands({
    openStore: async () => f.store,
    cvWatch: f.options.cvWatch,
  });
  const output = [];
  const args = { 'request-id': randomUUID(), 'duration-ms': '1000' };
  const log = (text) => output.push(decodeWire(text));
  try {
    assert.equal(await commands['vacancies-cv-watch'](args, log), 0);
    assert.equal(output[0].watch.state, 'watching');
    assert.equal(output[1].watch.state, 'expired');
    assert.equal(output[1].watch.active, false);
    await commands['vacancies-cv-watch-status']({}, log);
    await commands['vacancies-cv-snapshots']({}, log);
    assert.deepEqual(output.at(-1).snapshots, []);
    assert.deepEqual(f.counts(), { attached: 1, detached: 1, reads: 0 });
    assert.equal(closes, 3);
    assert.match(VACANCY_HELP, /vacancies-cv-watch/u);
  } finally {
    await f.service.stop();
  }
});
test('browser CV API verifies exact identities and cached recovery is interrupted without replay', async () => {
  const f = cvWatchFixture();
  const input = {
    requestId: randomUUID(),
    browserSlot: 'jobs',
    durationMs: 1000,
  };
  const seen = [];
  let result;
  const api = createVacancyApi({
    local: async () => f.store,
    get: async () => null,
    report: async (...args) => {
      seen.push(args);
      return result;
    },
  });
  try {
    result = await f.service['cv-watch'](input);
    assert.deepEqual(await api.vacancyCvWatch(input), result);
    assert.deepEqual(seen[0][2], { network: true, read: false });
    await assert.rejects(
      api.vacancyCvWatch({ ...input, requestId: randomUUID() })
    );
    const recovered = await api.vacancyCvWatchStatus({ browserSlot: 'jobs' });
    assert.equal(recovered.watch.state, 'interrupted');
    assert.equal(recovered.watch.active, false);
    assert.equal(seen.length, 2);
    assert.deepEqual(
      (await api.vacancyCvSnapshots({ browserSlot: 'jobs' })).snapshots,
      []
    );
    result = await f.service['cv-watch-stop'](input);
    assert.equal((await api.vacancyCvWatchStop(input)).watch.state, 'stopped');
  } finally {
    await f.service.stop();
  }
});
test('four localized CV views expose passive/save distinctions and retain disabled unsupported starts', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const html = renderInLocale(
      locale,
      React.createElement(CvSaveWatch, {
        state: {
          busy: '',
          capabilities: { cvSaveWatch: false },
          cvSaveWatch: {
            watch: null,
            snapshots: [],
            duration: '15',
            loadError: false,
          },
        },
        t: (key) => translate(locale, key),
      })
    );
    assert.ok(html.includes(translate(locale, 'cvWatch.hint')));
    assert.ok(html.includes(translate(locale, 'cvWatch.empty')));
    assert.match(
      html,
      /<button[^>]*disabled=""[^>]*data-cv-watch-action="start"/u
    );
    assert.doesNotMatch(html, />cvWatch\./u);
  }
});
