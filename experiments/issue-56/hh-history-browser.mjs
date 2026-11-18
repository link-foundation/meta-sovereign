import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { hhSource } from '../../js/src/sources/hh.js';
import { hhHistoryFixture } from './hh-history-fixture.mjs';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { verifyHhHistory } from '../../js/tests/helpers/e2e-hh-history.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const before = process.env.HH_HISTORY_BEFORE;
let source = hhSource;
if (before) {
  if (!/^[a-f0-9]{7,40}$/u.test(before)) {
    throw new Error('before must be a commit identifier');
  }
  const dir = await mkdtemp(join(tmpdir(), 'ms-hh-before-'));
  try {
    const { stdout } = await promisify(execFile)('git', [
      'show',
      `${before}:js/src/sources/hh.js`,
    ]);
    const code = stdout.replace(/from '([^']+)'/gu, (match, relative) =>
      relative.startsWith('.')
        ? `from '${new URL(relative, new URL('../../js/src/sources/hh.js', import.meta.url)).href}'`
        : match
    );
    const file = join(dir, 'hh-before.mjs');
    await writeFile(file, code);
    source = (await import(pathToFileURL(file).href)).hhSource;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const store = createMemoryStore();
await store.putMany(await source.parseArchive(hhHistoryFixture()));
const { page, base, until, finish } = await openChatApp('hh-history', {
  store,
});
await page.addInitScript(
  ({ key, value }) => globalThis.localStorage.setItem(key, value),
  {
    key: TUTORIAL_STORAGE_KEY,
    value: JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
  }
);
await finish(() =>
  verifyHhHistory({ page, base, store, until, before: Boolean(before) })
);
