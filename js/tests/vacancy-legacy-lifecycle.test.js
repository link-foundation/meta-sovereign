import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { withLegacyVacancies } from '../../experiments/issue-56/vacancy-legacy-fixture.mjs';

for (const rejected of [false, true]) {
  test(
    `legacy fixture leaves its working directory before removal after ${rejected ? 'rejection' : 'success'}`,
    { timeout: 5000 },
    async () => {
      const previous = process.cwd();
      const remove = fs.rm;
      const failure = new Error('Owner work rejected');
      let directory;
      let removed = false;
      fs.rm = async (target, options) => {
        if (target === directory) {
          assert.equal(
            process.cwd(),
            previous,
            'Leave the fixture before Windows removes its locked directory'
          );
          removed = true;
        }
        return remove(target, options);
      };
      try {
        const work = withLegacyVacancies(async (fixture) => {
          directory = fixture.directory;
          process.chdir(path.join(directory, 'vacancies'));
          if (rejected) {
            throw failure;
          }
          return 'completed';
        });
        if (rejected) {
          await assert.rejects(work, (error) => error === failure);
        } else {
          assert.equal(await work, 'completed');
        }
        assert.equal(removed, true);
        assert.equal(process.cwd(), previous);
        await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
      } finally {
        process.chdir(previous);
        fs.rm = remove;
        if (directory) {
          await remove(directory, { recursive: true, force: true });
        }
      }
    }
  );
}
