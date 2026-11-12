import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { randomUUID } from 'node:crypto';
import { cvPrepareFixture } from '../../experiments/issue-56/cv-prepare-fixture.mjs';
import {
  createVacancyCommands,
  VACANCY_HELP,
} from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { decodeWire, LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { CvPreparation } from '../src/web/cv-prepare-panel.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`preparation cancellation authenticates and recovers its exact request in ${type}`, async () => {
    const f = await cvPrepareFixture();
    const input = { requestId: f.input.requestId, browserSlot: 'jobs' };
    try {
      await withRoutes(
        async (base) => {
          assert.equal(
            (
              await wirePost(base, 'cv-prepare-cancel', input, type, {
                origin: 'https://untrusted.test',
              })
            ).status,
            403
          );
          const cancelled = await wirePost(
            base,
            'cv-prepare-cancel',
            input,
            type
          );
          assert.equal(cancelled.status, 200);
          assert.equal(cancelled.value.cancellation.state, 'cancelled');
          assert.equal(
            (await wirePost(base, 'cv-prepare', f.input, type)).value
              .cancellation.requestId,
            input.requestId
          );
          const reply = await fetch(
            `${base}/api/vacancies/cv-prepare-status?${new URLSearchParams(input)}`,
            { headers: { accept: type } }
          );
          assert.deepEqual(
            decodeWire(
              await reply.arrayBuffer(),
              reply.headers.get('content-type')
            ),
            cancelled.value
          );
          assert.equal(
            (await fetch(`${base}/api/vacancies/cv-prepare-cancel`)).status,
            405
          );
          assert.equal(f.calls.attached, 0);
        },
        {
          store: f.store,
          service: { artifactRoot: f.artifactRoot, cvPrepare: f.cvPrepare },
        }
      );
    } finally {
      await f.close();
    }
  });
}

test('CLI cancellation blocks a late preparation and closes each owned store', async () => {
  const f = await cvPrepareFixture();
  const output = [];
  let closes = 0;
  f.store.close = async () => {
    closes++;
  };
  const commands = createVacancyCommands({
    openStore: async () => f.store,
    artifactRoot: f.artifactRoot,
    cvPrepare: f.cvPrepare,
  });
  try {
    assert.equal(
      await commands['vacancies-cv-prepare-cancel'](
        { 'request-id': f.input.requestId },
        (value) => output.push(decodeWire(value))
      ),
      0
    );
    assert.equal(
      await commands['vacancies-cv-prepare'](
        {
          'request-id': f.input.requestId,
          fingerprint: f.input.fingerprint,
          'change-id': f.input.changeId,
        },
        (value) => output.push(decodeWire(value))
      ),
      1
    );
    assert.deepEqual(output[0], output[1]);
    assert.equal(closes, 2);
    assert.equal(f.calls.attached, 0);
    assert.match(VACANCY_HELP, /vacancies-cv-prepare-cancel --request-id/u);
  } finally {
    await f.close();
  }
});

test('browser cancellation requires an exact acknowledgement and recovers stored cancellations without mutation', async () => {
  const f = await cvPrepareFixture();
  const input = { requestId: f.input.requestId, browserSlot: 'jobs' };
  try {
    const result = await f.service['cv-prepare-cancel'](input);
    let response = result;
    let posts = 0;
    const api = createVacancyApi({
      get: async () => null,
      local: async () => f.store,
      report: async () => {
        posts++;
        return response;
      },
    });
    assert.deepEqual(await api.vacancyCvPrepareCancel(input), result);
    assert.deepEqual(await api.vacancyCvPrepareStatus(input), result);
    await assert.rejects(
      api.vacancyCvPrepareCancel({ ...input, requestId: randomUUID() })
    );
    response = { preparation: null };
    await assert.rejects(api.vacancyCvPrepareCancel(input));
    response = { ...result, preparation: { state: 'prepared' } };
    await assert.rejects(api.vacancyCvPrepareCancel(input));
    response = result;
    await assert.rejects(api.vacancyCvPrepare(f.input));
    assert.equal(posts, 5);
    assert.equal(f.calls.attached, 0);
  } finally {
    await f.close();
  }
});

test('four locales explain cancellation without claiming a native draft was undone', async () => {
  const f = await cvPrepareFixture();
  try {
    const { cancellation } = await f.service['cv-prepare-cancel'](f.input);
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      const html = renderInLocale(
        locale,
        React.createElement(CvPreparation, {
          state: {
            ready: true,
            cancellation,
            canCancel: true,
            pendingId: f.input.requestId,
          },
          review: f.review,
          idle: true,
          t: (key) => translate(locale, key),
        })
      );
      assert.ok(html.includes(translate(locale, 'cvPrepare.cancel')));
      assert.ok(html.includes(translate(locale, 'cvPrepare.cancelled')));
      assert.ok(!html.includes('cvPrepare.'));
    }
  } finally {
    await f.close();
  }
});
