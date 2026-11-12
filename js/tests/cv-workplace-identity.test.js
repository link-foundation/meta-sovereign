import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifyCvSave } from '../src/jobs/cv-watch-verification.js';
import { cvWorkplaceIdentityFixture } from '../../experiments/issue-56/cv-workplace-identity-fixture.mjs';
import {
  cvWatchFixture,
  cvWatchRaw,
} from '../../experiments/issue-56/cv-watch-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';
import { cvSnapshotsResult } from '../src/jobs/cv-watch-record.js';
import { readCvSavedWorkplace } from '../src/jobs/cv-workplace-readback.js';
import { fetchCvSavedHtml } from '../src/jobs/cv-watch-export.js';
import { readCvEditorDocument } from '../src/jobs/cv-watch-document.js';
import React from 'react';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { withRoutes } from './helpers/vacancy-routes.mjs';
import { decodeWire, LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { CvSaveWatch } from '../src/web/cv-watch-panel.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';

test('exact saved workplace membership can detach a record while preserving other CV jobs', () => {
  const { attempt, exports } = cvWorkplaceIdentityFixture();
  assert.equal(verifyCvSave(attempt, exports, attempt), true);
});

test('matching exports alone cannot prove the shared workplace record was saved', () => {
  const { attempt, exports } = cvWorkplaceIdentityFixture();
  exports[1].cv.jobs = [];
  assert.equal(verifyCvSave(attempt, exports), false);
});

test('record identity, final fields and the entire native CV selection must agree', () => {
  const { attempt, exports } = cvWorkplaceIdentityFixture();
  for (const patch of [
    { recordId: null },
    { recordId: '456' },
    { description: 'Older prose' },
    { company: 'Other employer' },
    { position: 'Manager' },
    { start: '2020-02' },
    { end: '2024-06' },
    { current: true },
    { area: 'Paris' },
    { website: 'other.test' },
    { metadataEditable: false },
    { industryText: 'Other industry' },
    { resumes: [attempt.resumes[0]] },
    { resumes: attempt.resumes.map((row) => ({ ...row, checked: true })) },
    { resumes: [...attempt.resumes, { hash: 'third', checked: false }] },
  ]) {
    assert.equal(
      verifyCvSave(attempt, exports, { ...attempt, ...patch }),
      false
    );
  }
  assert.equal(
    verifyCvSave({ ...attempt, recordId: null }, exports, attempt),
    false
  );
  assert.equal(verifyCvSave(attempt, exports.slice(0, 1), attempt), false);
  // An identical independent record in the unchecked CV does not establish
  // membership of record 123; only record 123's own fresh checkboxes do.
  exports[1].cv.jobs = exports[0].cv.jobs;
  assert.equal(verifyCvSave(attempt, exports, attempt), true);
  exports[0].cv.jobs.push(exports[0].cv.jobs[0]);
  assert.equal(verifyCvSave(attempt, exports, attempt), false);
});

test('workplace evidence refuses extra exports outside the complete native CV set', () => {
  const { attempt, exports } = cvWorkplaceIdentityFixture();
  assert.equal(
    verifyCvSave(
      attempt,
      [...exports, { ...exports[0], hash: 'third' }],
      attempt
    ),
    false
  );
});

test('workplace evidence refuses unobserved metadata even when every CV is unchecked', () => {
  const { attempt, exports } = cvWorkplaceIdentityFixture();
  const detached = {
    ...attempt,
    resumes: attempt.resumes.map((row) => ({ ...row, checked: false })),
    metadataEditable: false,
    industryText: null,
  };
  assert.equal(
    verifyCvSave(detached, exports, {
      ...detached,
      metadataEditable: true,
      industryText: '',
    }),
    false
  );
  const visible = { ...detached, metadataEditable: true, industryText: '' };
  assert.equal(verifyCvSave(visible, exports, visible), true);
});

test('native workplace readback binds inert final fields to one bounded exact record GET', async () => {
  const { raw, attempt } = cvWorkplaceIdentityFixture();
  const calls = [];
  let checks = 0;
  const session = {
    commander: {
      evaluate: async ({ fn, args }) => {
        calls.push({ fn, args });
        return fn === fetchCvSavedHtml ? '<html>Native record</html>' : raw;
      },
    },
  };
  const result = await readCvSavedWorkplace({
    session,
    attempt,
    check: () => checks++,
  });
  assert.deepEqual(result.resumes, attempt.resumes);
  assert.match(result.sha256, /^[a-f\d]{64}$/u);
  assert.equal(checks, 3);
  assert.deepEqual(calls[0], {
    fn: fetchCvSavedHtml,
    args: [{ recordId: '123' }],
  });
  assert.equal(calls[1].fn, readCvEditorDocument);
  assert.equal(calls[1].args[0].url, raw.url);
  assert.equal(calls[1].args[0].html, '<html>Native record</html>');
  for (const recordId of [null, '', 123, '../123', '1'.repeat(101)]) {
    await assert.rejects(
      readCvSavedWorkplace({
        session,
        attempt: { ...attempt, recordId },
        check: () => {},
      }),
      { code: 'jobs-cv-record' }
    );
  }
  assert.equal(calls.length, 2);
});

test('missing, oversized and challenged saved records never supply an identity proof', async () => {
  const { attempt } = cvWorkplaceIdentityFixture();
  for (const html of [
    null,
    'a'.repeat(2 * 1024 ** 2 + 1),
    '<input name="captcha">',
  ]) {
    const session = {
      commander: {
        evaluate: async ({ fn }) => (fn === fetchCvSavedHtml ? html : null),
      },
    };
    await assert.rejects(
      readCvSavedWorkplace({ session, attempt, check: () => {} }),
      { code: 'jobs-cv-record' }
    );
  }
});

test('native record fetch uses a query-free bounded GET and refuses redirects, errors and invalid UTF-8', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let cancellations = 0;
  let mode = 'ready';
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'https://hh.ru' },
  });
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url.href, 'https://hh.ru/profile/edit/experience/123');
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, undefined);
    assert.equal(options.signal.aborted, false);
    const body =
      mode === 'encoding'
        ? new Uint8Array([255])
        : mode === 'stream'
          ? new Uint8Array(2 * 1024 ** 2 + 1)
          : '<html>Record</html>';
    const response = new globalThis.Response(body, {
      status: mode === 'error' ? 403 : 200,
    });
    Object.defineProperty(response, 'url', {
      value: mode === 'redirect' ? 'https://hh.ru/account/login' : url.href,
    });
    if (mode === 'length') {
      response.headers.set('content-length', String(2 * 1024 ** 2 + 1));
    }
    const cancel = response.body.cancel.bind(response.body);
    response.body.cancel = async () => {
      cancellations++;
      return cancel();
    };
    return response;
  };
  try {
    assert.equal(
      await fetchCvSavedHtml({ recordId: '123' }),
      '<html>Record</html>'
    );
    for (mode of ['error', 'redirect', 'length', 'stream', 'encoding']) {
      await assert.rejects(fetchCvSavedHtml({ recordId: '123' }));
    }
    for (const recordId of ['../123', '1?resumeFrom=other', '1'.repeat(101)]) {
      await assert.rejects(fetchCvSavedHtml({ recordId }));
    }
    for (const recordId of [null, 123, {}, []]) {
      await assert.rejects(fetchCvSavedHtml({ recordId, hash: 'valid' }));
    }
    await assert.rejects(fetchCvSavedHtml({ hash: 123 }));
    assert.equal(calls, 6);
    assert.equal(
      cancellations,
      3,
      'Rejected response bodies must be cancelled'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (descriptor) {
      Object.defineProperty(globalThis, 'location', descriptor);
    } else {
      delete globalThis.location;
    }
  }
});

const workplaceWatch = (verification) => {
  const identity = cvWorkplaceIdentityFixture();
  const fixture = cvWatchFixture({ verification });
  fixture.exports(
    identity.exports.map((row) => ({
      ...row,
      cv: { ...cvWatchRaw(), ...row.cv },
      sha256: 'a'.repeat(64),
    }))
  );
  return {
    ...fixture,
    ...identity,
    request: { requestId: randomUUID(), durationMs: 1000 },
  };
};

const verifyWorkplaceControls = async (f, result) => {
  await withRoutes(
    async (base) => {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `${base}/api/vacancies/cv-snapshots?browserSlot=jobs`,
          { headers: { accept: type } }
        );
        assert.equal(response.status, 200);
        assert.deepEqual(
          decodeWire(
            await response.arrayBuffer(),
            response.headers.get('content-type')
          ),
          result
        );
      }
    },
    { store: f.store }
  );
  const commands = createVacancyCommands({ openStore: async () => f.store });
  let output;
  assert.equal(
    await commands['vacancies-cv-snapshots']({}, (text) => {
      output = decodeWire(text);
    }),
    0
  );
  assert.deepEqual(output, result);
  const api = createVacancyApi({
    get: async () => null,
    local: async () => f.store,
  });
  assert.deepEqual(
    await api.vacancyCvSnapshots({ browserSlot: 'jobs' }),
    result
  );
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    for (const snapshot of result.snapshots) {
      const html = renderInLocale(
        locale,
        React.createElement(CvSaveWatch, {
          state: {
            busy: '',
            cvSaveWatch: { watch: null, snapshots: [snapshot], duration: '15' },
          },
          t: (key) => translate(locale, key),
        })
      );
      assert.match(html, /data-cv-workplace-evidence="123"/u);
      assert.ok(
        html.includes(
          translate(
            locale,
            snapshot.workplace.checked ? 'cvWatch.included' : 'cvWatch.excluded'
          )
        )
      );
      assert.ok(html.includes(snapshot.workplace.sha256));
      assert.doesNotMatch(html, />cvWatch\./u);
    }
  }
  assert.equal(f.counts().attached, 1);
};

test('verified record membership survives status/snapshot recovery with per-CV inclusion evidence', async () => {
  const { attempt } = cvWorkplaceIdentityFixture();
  const f = workplaceWatch({
    readWorkplace: async () => ({ ...attempt, sha256: 'b'.repeat(64) }),
  });
  try {
    await f.service['cv-watch'](f.request);
    await f.emit('save', f.raw);
    assert.equal((await f.wait('saved')).watch.saves, 1);
    const result = await f.service['cv-snapshots']({});
    assert.deepEqual(
      result.snapshots.map((row) => row.workplace),
      [
        { recordId: '123', sha256: 'b'.repeat(64), checked: true },
        { recordId: '123', sha256: 'b'.repeat(64), checked: false },
      ]
    );
    assert.deepEqual(cvSnapshotsResult(result), result);
    await verifyWorkplaceControls(f, result);
    for (const workplace of [
      { recordId: '../123' },
      { sha256: 'invalid' },
      { checked: 'false' },
    ]) {
      const row = result.snapshots[0];
      assert.throws(() =>
        cvSnapshotsResult({
          ...result,
          snapshots: [
            { ...row, workplace: { ...row.workplace, ...workplace } },
          ],
        })
      );
    }
  } finally {
    await f.service.stop();
  }
});

test('Cancel during an issued native record read suppresses snapshot publication', async () => {
  const entered = gate();
  const release = gate();
  const { attempt } = cvWorkplaceIdentityFixture();
  const f = workplaceWatch({
    readWorkplace: async () => {
      entered.resolve();
      await release.promise;
      return { ...attempt, sha256: 'b'.repeat(64) };
    },
  });
  try {
    await f.service['cv-watch'](f.request);
    await f.emit('save', f.raw);
    await entered.promise;
    await f.emit('cancel', f.raw);
    release.resolve();
    assert.equal((await f.wait('cancelled')).watch.saves, 0);
    assert.deepEqual((await f.service['cv-snapshots']({})).snapshots, []);
  } finally {
    release.resolve();
    await f.service.stop();
  }
});

test('Stop drains an issued record read before detaching and never publishes it', async () => {
  const entered = gate();
  const release = gate();
  const { attempt } = cvWorkplaceIdentityFixture();
  const f = workplaceWatch({
    readWorkplace: async () => {
      entered.resolve();
      await release.promise;
      return { ...attempt, sha256: 'b'.repeat(64) };
    },
  });
  try {
    await f.service['cv-watch'](f.request);
    await f.emit('save', f.raw);
    await entered.promise;
    const stopped = f.service['cv-watch-stop'](f.request);
    assert.equal(f.counts().detached, 0);
    release.resolve();
    assert.equal((await stopped).watch.state, 'stopped');
    assert.equal(f.counts().detached, 1);
    assert.deepEqual((await f.service['cv-snapshots']({})).snapshots, []);
  } finally {
    release.resolve();
    await f.service.stop();
  }
});
