import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import React from 'react';
import { cvPrepareFixture } from '../../experiments/issue-56/cv-prepare-fixture.mjs';
import {
  cvPrepareOptions,
  cvPrepareResult,
} from '../src/jobs/cv-prepare-record.js';
import { cvPrepareSource } from '../src/jobs/cv-prepare-source.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { decodeWire, LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { CvPreparation } from '../src/web/cv-prepare-panel.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';

const changeId = 'en:jobs.0.description';
const fixture = () => cvPrepareFixture({ selected: [changeId] });
const request = (f) => ({ ...f.input, changeId, recordId: '123' });

test('a selected workplace description resolves its verified job and exact chosen record', async () => {
  const f = await fixture();
  try {
    const input = request(f);
    assert.equal(cvPrepareOptions(input).recordId, '123');
    const change = await cvPrepareSource(f, input);
    assert.equal(change.field, 'jobs.0.description');
    assert.equal(change.workplace.recordId, '123');
    assert.deepEqual(
      change.workplace.job,
      f.review.sources.find((row) => row.cv.language === 'en').cv.jobs[0]
    );
    assert.equal(change.before, change.workplace.job.description);
    const first = await f.service['cv-prepare'](input);
    assert.equal(first.preparation.state, 'prepared');
    assert.equal(first.preparation.recordId, '123');
    assert.equal(first.preparation.providerSaved, false);
    assert.deepEqual(await f.service['cv-prepare'](input), first);
    assert.equal(f.calls.prepared, 1);
    await assert.rejects(
      f.service['cv-prepare']({ ...input, recordId: '456' }),
      { code: 'jobs-cv-conflict' }
    );
    assert.throws(() =>
      cvPrepareResult(first.preparation, { recordId: '456' })
    );
    assert.equal(
      JSON.stringify(
        await f.store.get(`jobs-cv-prepare:${input.requestId}`)
      ).includes(change.before),
      false
    );
  } finally {
    await f.close();
  }
});

test('missing, malformed or unrelated record identities cannot prepare a workplace', async () => {
  const f = await fixture();
  try {
    for (const recordId of [
      undefined,
      null,
      123,
      ['123'],
      '',
      '../123',
      '1?resumeFrom=x',
      '1'.repeat(101),
    ]) {
      await assert.rejects(
        f.service['cv-prepare']({ ...request(f), recordId })
      );
    }
    assert.throws(() => cvPrepareOptions({ ...f.input, recordId: '123' }));
    for (const id of [
      'en:jobs.-1.description',
      'en:jobs.01.description',
      'en:jobs.0.company',
    ]) {
      assert.throws(() => cvPrepareOptions({ ...request(f), changeId: id }));
    }
    assert.equal(f.calls.attached, 0);
    const absent = await f.service['cv-prepare']({
      ...request(f),
      changeId: 'en:jobs.1.description',
    });
    assert.equal(absent.preparation.state, 'failed');
    assert.equal(absent.preparation.code, 'jobs-cv-conflict');
    assert.equal(f.calls.attached, 0);
  } finally {
    await f.close();
  }
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`workplace preparation retains record identity through authenticated ${type}`, async () => {
    const f = await fixture();
    try {
      await withRoutes(async (base) => {
        assert.equal(
          (
            await wirePost(base, 'cv-prepare', request(f), type, {
              origin: 'https://untrusted.test',
            })
          ).status,
          403
        );
        const answer = await wirePost(base, 'cv-prepare', request(f), type);
        assert.equal(answer.status, 200);
        assert.equal(answer.value.preparation.recordId, '123');
        const response = await fetch(
          `${base}/api/vacancies/cv-prepare-status?browserSlot=jobs`,
          { headers: { accept: type } }
        );
        assert.deepEqual(
          decodeWire(
            await response.arrayBuffer(),
            response.headers.get('content-type')
          ),
          answer.value
        );
        assert.equal(f.calls.prepared, 1);
      }, f.routeOptions);
    } finally {
      await f.close();
    }
  });
}

test('CLI and local UI API share exact workplace identity and reject mismatched receipts', async () => {
  const f = await fixture();
  try {
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      artifactRoot: f.artifactRoot,
      cvPrepare: f.cvPrepare,
    });
    let result;
    assert.equal(
      await commands['vacancies-cv-prepare'](
        {
          fingerprint: f.input.fingerprint,
          'change-id': changeId,
          'record-id': '123',
          'request-id': f.input.requestId,
        },
        (wire) => {
          result = decodeWire(wire);
        }
      ),
      0
    );
    assert.equal(result.preparation.recordId, '123');
    const api = createVacancyApi({
      get: async () => null,
      local: async () => f.store,
      report: async () => result,
    });
    assert.deepEqual(await api.vacancyCvPrepare(request(f)), result);
    await assert.rejects(
      api.vacancyCvPrepare({ ...request(f), recordId: '456' })
    );
    assert.deepEqual(
      await api.vacancyCvPrepareStatus({ browserSlot: 'jobs' }),
      result
    );
  } finally {
    await f.close();
  }
});

test('four locales identify the workplace, require its numeric ID and preserve owner Save', async () => {
  const f = await fixture();
  try {
    const { preparation } = await f.service['cv-prepare'](request(f));
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
      assert.match(html, /data-cv-prepare-record="en:jobs.0.description"/u);
      assert.match(
        html,
        /data-cv-prepare-change="en:jobs.0.description" disabled=""|disabled=""[^>]*data-cv-prepare-change="en:jobs.0.description"/u
      );
      assert.ok(html.includes('ArtBridge'));
      assert.ok(html.includes(translate(locale, 'cvPrepare.prepared')));
      assert.ok(!html.includes('cvPrepare.'));
    }
    const unselected = await f.service['cv-prepare']({
      ...f.input,
      requestId: randomUUID(),
    });
    assert.equal(unselected.preparation.state, 'failed');
    assert.equal(f.calls.attached, 1);
  } finally {
    await f.close();
  }
});
