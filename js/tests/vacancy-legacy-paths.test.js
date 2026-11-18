import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  withLegacyVacancies,
  legacyNotation,
} from '../../experiments/issue-56/vacancy-legacy-fixture.mjs';

test(
  'legacy cache migration canonicalizes ancestor aliases and keeps one original identity',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ directory, legacy, write, open }) => {
      await write();
      const alias = path.join(directory, 'workspace-alias');
      await fs.symlink(directory, alias, 'junction');
      const first = await open({
        legacyVacancyDirectories: [path.join(alias, 'vacancies')],
      });
      const before = await first.service.stored();
      assert.equal(
        before.entries.length,
        1,
        'A valid aliased source must migrate'
      );
      assert.deepEqual(before.cacheMigration, {
        imported: 1,
        existing: 0,
        invalid: [],
      });
      await first.service.stop();
      await first.store.close();
      const second = await open({
        legacyVacancyDirectories: [await fs.realpath(legacy)],
      });
      assert.deepEqual((await second.service.stored()).cacheMigration, {
        imported: 0,
        existing: 1,
        invalid: [],
      });
      const originals = await second.store.query((row) =>
        row.id.startsWith('vacancy-legacy:')
      );
      assert.equal(originals.length, 1);
      assert.equal(originals[0].text, legacyNotation());
      assert.equal(
        await fs.readFile(path.join(legacy, '123.lino'), 'utf8'),
        legacyNotation()
      );
    });
  }
);

test(
  'legacy cache migration still refuses a directly linked source directory',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ directory, legacy, write, open }) => {
      await write();
      const linked = path.join(directory, 'linked-cache');
      await fs.symlink(legacy, linked, 'junction');
      const { service, store } = await open({
        legacyVacancyDirectories: [linked],
      });
      await assert.rejects(service.stored(), {
        code: 'jobs-vacancy-cache-import',
      });
      assert.deepEqual(
        await store.query((row) => row.id.startsWith('vacancy-legacy:')),
        []
      );
      assert.equal(
        await fs.readFile(path.join(legacy, '123.lino'), 'utf8'),
        legacyNotation()
      );
    });
  }
);
