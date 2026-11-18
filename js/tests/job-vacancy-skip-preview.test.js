import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { observeVacancySkip } from '../src/jobs/vacancy-skip-service.js';
import { vacancySkipId } from '../src/jobs/vacancy-skip-data.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { skipSnapshot } from '../../experiments/issue-56/vacancy-skip-fixture.mjs';

const options = { timeout: 5000 };
const reasons = {
  external_site: ['external', 'external'],
  resume_not_visible: ['resumeNotVisible', 'resume-not-visible'],
  vacancy_unavailable: ['vacancyUnavailable', 'vacancy-unavailable'],
};

for (const [reason, [flag, state]] of Object.entries(reasons)) {
  test(
    `preview ${reason} observations never persist a refusal after reopen`,
    options,
    async (t) => {
      const directory = await mkdtemp(join(tmpdir(), 'ms-preview-skip-'));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const filename = join(directory, 'private.lino');
      const f = applicationFixture({
        store: await createLinoTextStore(filename),
      });
      t.after(() => f.close());
      const receipt = await f.service['application-open']({
        ...applicationInput,
        testMode: true,
      });
      f.state.page[flag] = true;
      const observed = await f.service['application-read']({
        ...applicationInput,
        revision: receipt.revision,
      });
      assert.equal(observed.state, state, 'native refusal remains visible');
      assert.equal(observed.testMode, true);
      await f.service['application-close']({
        ...applicationInput,
        revision: observed.revision,
      });
      assert.equal(f.state.entered, 0);
      assert.equal(f.state.submitted, 0);
      assert.deepEqual(f.state.writes, []);
      await f.close();
      const reopened = await createLinoTextStore(filename);
      try {
        assert.equal(
          (await reopened.get(vacancySkipId('jobs'))) ?? null,
          null,
          'preview must not create permanent refusals'
        );
      } finally {
        await reopened.close();
      }
    }
  );
}

for (const [operation, change] of Object.entries({
  edit: {
    page: { external: true, externalUrl: 'https://employer.example/later' },
  },
  count: { requestId: 'different-preview', page: { external: true } },
  replace: { page: { resumeNotVisible: true } },
  remove: { delivery: 'provider-confirmed', page: { delivered: true } },
})) {
  test(`preview cannot ${operation} an existing refusal`, options, async () => {
    const before = skipSnapshot();
    const store = createMemoryStore();
    await store.put({ id: vacancySkipId('jobs'), ...before });
    await observeVacancySkip(store, {
      ...applicationInput,
      browserSlot: 'jobs',
      vacancy: { title: 'Preview must not replace saved metadata' },
      options: { testMode: true },
      ...change,
      page: { bound: true, ...change.page },
    });
    const row = await store.get(vacancySkipId('jobs'));
    assert(row, 'preview must retain the existing refusal');
    const { id, ...actual } = row;
    assert.equal(id, vacancySkipId('jobs'));
    assert.deepEqual(
      actual,
      before,
      'preview must preserve every saved field and revision'
    );
  });
}

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `preview refusal stays read-only through ${type}`,
    options,
    async (t) => {
      const f = applicationFixture();
      t.after(() => f.close());
      await withRoutes(
        async (base) => {
          const opened = await wirePost(
            base,
            'application-open',
            {
              ...applicationInput,
              testMode: true,
            },
            type
          );
          assert.equal(opened.status, 200);
          f.state.page.external = true;
          const observed = await wirePost(
            base,
            'application-read',
            {
              ...applicationInput,
              revision: opened.value.revision,
            },
            type
          );
          assert.equal(observed.status, 200);
          assert.equal(observed.value.state, 'external');
          assert.equal(observed.value.testMode, true);
          const response = await fetch(`${base}/api/vacancies/skips-stored`, {
            headers: { accept: type },
          });
          assert.equal(response.status, 200);
          const skips = decodeWire(
            await response.arrayBuffer(),
            response.headers.get('content-type')
          );
          assert.equal(skips.revision, 'empty');
          assert.deepEqual(skips.entries, []);
          assert.equal(f.state.entered, 0);
          assert.equal(f.state.submitted, 0);
        },
        { store: f.store, service: f.serviceOptions }
      );
    }
  );
}
