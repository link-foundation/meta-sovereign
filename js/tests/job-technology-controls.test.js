import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createVacancyCommands,
  VACANCY_HELP,
} from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { createVacancyService } from '../src/jobs/service.js';
import {
  decodeWire,
  encodeWire,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { technologyFixture } from '../../experiments/issue-56/technology-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';
import React from 'react';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';
import { VacancyTechnologies } from '../src/web/vacancy-technologies.js';

const withFixture = async (work) => {
  const fixture = await technologyFixture();
  try {
    return await work(fixture);
  } finally {
    await fixture.close();
  }
};

test('four localized CV views retain evidence, explicit selection and unsaved-catalog guards', async () => {
  await withFixture(async (fixture) => {
    const service = createVacancyService(fixture);
    try {
      const catalog = await service['technology-catalog']();
      const { analysis } = await service['technology-analyze']({
        ...fixture.input,
        revision: catalog.revision,
      });
      const state = {
        values: { browserSlot: 'jobs' },
        busy: '',
        resumeExports: { exports: [fixture.receipt] },
        technology: {
          catalog,
          draft: catalog.entries,
          analysis,
          selection: '',
          dirty: true,
        },
      };
      for (const locale of ['en', 'ru', 'zh', 'hi']) {
        const html = renderInLocale(
          locale,
          React.createElement(VacancyTechnologies, {
            state,
            t: (key) => translate(locale, key),
          })
        );
        assert.ok(html.includes(translate(locale, 'technology.title')));
        assert.match(html, /data-technology-action="analyze" disabled/u);
        assert.ok(html.includes(translate(locale, 'technology.unsaved')));
        assert.ok(html.includes(analysis.resume.sha256));
        assert.match(html, /React Native/u);
        assert.ok(html.includes('Keep the original final paragraph.'));
        assert.doesNotMatch(html, />technology\./u);
      }
    } finally {
      await service.stop();
    }
  });
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`technology catalog and analysis use authenticated mutation routes and ${type}`, async () => {
    await withFixture(async (fixture) =>
      withRoutes(
        async (base, calls) => {
          const response = await fetch(
            `${base}/api/vacancies/technology-catalog`,
            { headers: { accept: type } }
          );
          const catalog = decodeWire(
            await response.arrayBuffer(),
            response.headers.get('content-type')
          );
          const answer = await wirePost(
            base,
            'technology-analyze',
            { ...fixture.input, revision: catalog.revision },
            type
          );
          assert.equal(answer.status, 200);
          assert.equal(answer.value.analysis.vacancies.length, 2);
          assert.deepEqual(calls, []);
          const refused = await wirePost(
            base,
            'technology-catalog-save',
            { ...catalog, entries: [] },
            type,
            { origin: 'https://untrusted.test' }
          );
          assert.equal(refused.status, 403);
          assert.equal(
            (
              await wirePost(
                base,
                'technology-catalog-save',
                { ...catalog, entries: [] },
                type
              )
            ).status,
            200
          );
          const conflict = await wirePost(
            base,
            'technology-catalog-save',
            catalog,
            type
          );
          assert.equal(conflict.status, 409);
          assert.equal(conflict.value.code, 'jobs-technology-conflict');
          assert.equal(
            (await fetch(`${base}/api/vacancies/technology-analyze`)).status,
            405
          );
        },
        {
          store: fixture.store,
          service: { artifactRoot: fixture.artifactRoot },
        }
      )
    );
  });
}
test('CLI exposes the same verified selection, catalog file and saved report', async () => {
  await withFixture(async (fixture) => {
    let closes = 0;
    fixture.store.close = async () => {
      closes++;
    };
    const commands = createVacancyCommands({
      openStore: async () => fixture.store,
      artifactRoot: fixture.artifactRoot,
    });
    const output = [];
    const log = (value) => output.push(decodeWire(value));
    await commands['vacancies-technology-catalog']({}, log);
    const catalog = output.at(-1);
    for (const [name, type] of [
      ['catalog.lino', LINO_TEXT],
      ['catalog.bin', LINO_BINARY],
    ]) {
      const file = join(fixture.artifactRoot, name);
      await writeFile(file, encodeWire(catalog, type));
      assert.equal(
        await commands['vacancies-technology-catalog-save']({ file }, log),
        0
      );
      assert.equal(output.at(-1).revision, catalog.revision);
    }
    assert.equal(
      await commands['vacancies-technology-analyze'](
        {
          'export-id': fixture.input.exportId,
          resume: fixture.input.hash,
          revision: catalog.revision,
        },
        log
      ),
      0
    );
    const report = output.at(-1);
    await commands['vacancies-technology-analysis-stored']({}, log);
    assert.deepEqual(output.at(-1), report);
    assert.equal(closes, 5);
    assert.match(VACANCY_HELP, /vacancies-technology-analyze/u);
    const oversized = join(fixture.artifactRoot, 'oversized.lino');
    await writeFile(oversized, Buffer.alloc(256 * 1024 + 1));
    await assert.rejects(
      commands['vacancies-technology-catalog-save']({ file: oversized }, log)
    );
  });
});
test('browser API refuses stale acknowledgements and preserves offline cached reports', async () => {
  await withFixture(async (fixture) => {
    const service = createVacancyService(fixture);
    try {
      const catalog = await service['technology-catalog']();
      const input = { ...fixture.input, revision: catalog.revision };
      const answer = await service['technology-analyze'](input);
      const seen = [];
      const api = createVacancyApi({
        get: async () => null,
        local: async () => fixture.store,
        report: async (...args) => {
          seen.push(args);
          return answer;
        },
      });
      assert.deepEqual(
        await api.vacancyTechnologyAnalysisStored({ browserSlot: 'jobs' }),
        answer
      );
      assert.deepEqual(await api.vacancyTechnologyAnalyze(input), answer);
      assert.deepEqual(seen[0][2], { network: true, read: false });
      await assert.rejects(
        api.vacancyTechnologyAnalyze({ ...input, hash: 'other' })
      );
      const stale = createVacancyApi({
        get: async () => catalog,
        report: async () => catalog,
      });
      await assert.rejects(
        stale.vacancyTechnologyCatalogSave({ ...catalog, entries: [] })
      );
      await assert.rejects(
        createVacancyApi({ get: async () => null }).vacancyTechnologyCatalog()
      );
    } finally {
      await service.stop();
    }
  });
});
test('catalog reads wait for durable acknowledgement and concurrent writes are refused', async () => {
  await withFixture(async (fixture) => {
    const service = createVacancyService(fixture);
    const release = gate();
    try {
      const initial = await service['technology-catalog']();
      const flushing = gate();
      fixture.store.flush = async () => {
        flushing.resolve();
        await release.promise;
      };
      const writing = service['technology-catalog-save']({
        ...initial,
        entries: [],
      });
      await flushing.promise;
      let resolved = false;
      const reading = service['technology-catalog']().then((answer) => {
        resolved = true;
        return answer;
      });
      await assert.rejects(service['technology-catalog-save'](initial), {
        code: 'jobs-busy',
      });
      assert.equal(resolved, false);
      release.resolve();
      assert.deepEqual(await reading, await writing);
    } finally {
      release.resolve();
      await service.stop();
    }
  });
});
test('failed report flush retains previous acknowledgement', async () => {
  await withFixture(async (fixture) => {
    const service = createVacancyService(fixture);
    try {
      const catalog = await service['technology-catalog']();
      const input = { ...fixture.input, revision: catalog.revision };
      const previous = await service['technology-analyze'](input);
      fixture.store.flush = async () => {
        throw new Error('fixture write failure');
      };
      await assert.rejects(service['technology-analyze'](input));
      assert.deepEqual(
        await service['technology-analysis-stored'](input),
        previous
      );
    } finally {
      await service.stop();
    }
  });
});
