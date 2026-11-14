import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
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
  test(`native preparation authenticates mutation and recovers read-only in ${type}`, async () => {
    const f = await cvPrepareFixture();
    try {
      await withRoutes(async (base) => {
        assert.equal(
          (
            await wirePost(base, 'cv-prepare', f.input, type, {
              origin: 'https://untrusted.test',
            })
          ).status,
          403
        );
        const prepared = await wirePost(base, 'cv-prepare', f.input, type);
        assert.equal(prepared.status, 200);
        assert.equal(prepared.value.preparation.state, 'prepared');
        const response = await fetch(
          `${base}/api/vacancies/cv-prepare-status?browserSlot=jobs`,
          { headers: { accept: type } }
        );
        assert.deepEqual(
          decodeWire(
            await response.arrayBuffer(),
            response.headers.get('content-type')
          ),
          prepared.value
        );
        assert.equal(
          (await fetch(`${base}/api/vacancies/cv-prepare`)).status,
          405
        );
        assert.equal(f.calls.attached, 1);
      }, f.routeOptions);
    } finally {
      await f.close();
    }
  });
}
test('CLI shares the selected review preparation and status while closing its owned store', async () => {
  const f = await cvPrepareFixture();
  let closes = 0;
  const output = [];
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
      await commands['vacancies-cv-prepare'](
        {
          fingerprint: f.input.fingerprint,
          'change-id': f.input.changeId,
          'request-id': f.input.requestId,
        },
        (value) => output.push(decodeWire(value))
      ),
      0
    );
    await commands['vacancies-cv-prepare-status']({}, (value) =>
      output.push(decodeWire(value))
    );
    assert.deepEqual(output[0], output[1]);
    assert.equal(closes, 2);
    assert.match(VACANCY_HELP, /vacancies-cv-prepare --fingerprint/u);
  } finally {
    await f.close();
  }
});
test('browser preparation rejects mismatched acknowledgements and cached interrupted states never mutate', async () => {
  const f = await cvPrepareFixture();
  try {
    const answer = await f.service['cv-prepare'](f.input);
    let posts = 0;
    const api = createVacancyApi({
      get: async () => null,
      local: async () => f.store,
      report: async () => {
        posts++;
        return answer;
      },
    });
    assert.deepEqual(await api.vacancyCvPrepare(f.input), answer);
    await assert.rejects(
      api.vacancyCvPrepare({ ...f.input, changeId: 'ru:about' })
    );
    assert.deepEqual(
      await api.vacancyCvPrepareStatus({ browserSlot: 'jobs' }),
      answer
    );
    assert.equal(posts, 2);
    assert.equal(f.calls.attached, 1);
  } finally {
    await f.close();
  }
});
test('four CV locales distinguish preparation from a confirmed provider Save', async () => {
  const f = await cvPrepareFixture();
  try {
    const { preparation } = await f.service['cv-prepare'](f.input);
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      const html = renderInLocale(
        locale,
        React.createElement(CvPreparation, {
          state: { ready: true, preparation },
          review: f.review,
          idle: true,
          t: (key) => translate(locale, key),
        })
      );
      assert.match(html, /data-cv-prepare-change="en:about"/u);
      assert.ok(html.includes(translate(locale, 'cvPrepare.prepared')));
      assert.ok(!html.includes('cvPrepare.'));
    }
  } finally {
    await f.close();
  }
});
