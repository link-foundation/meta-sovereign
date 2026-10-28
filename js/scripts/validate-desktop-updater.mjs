// Validate the actual installed desktop updater, without loading Electron or
// contacting an update server. Run after staging on every target platform.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const validateDesktopUpdater = async (out) => {
  const require = createRequire(join(out, 'package.json'));
  const updater = createRequire(
    require.resolve('electron-updater/package.json')
  );
  const comparator = updater('lodash.isequal/package.json');
  assert.equal(comparator.name, 'lodash.isequalwith');
  assert.equal(comparator.version, '4.4.0');
  const equal = updater('lodash.isequal');
  const info = {
    version: '1.2.3',
    files: [{ url: 'app.zip', sha512: 'checksum', size: 144 }],
    releaseDate: '2026-10-28',
    releaseNotes: [{ version: '1.2.3', note: 'fixture' }],
  };
  assert.equal(equal(info, globalThis.structuredClone(info)), true);
  assert.equal(equal(info, { ...info, optional: undefined }), false);
  assert.equal(equal(NaN, NaN), true);
  assert.equal(equal(-0, 0), true);
  assert.equal(equal([1, 2], [2, 1]), false);
  const { DownloadedUpdateHelper } = updater('./out/DownloadedUpdateHelper.js');
  const dir = await mkdtemp(join(tmpdir(), 'meta-updater-validation-'));
  try {
    const file = join(dir, 'download.zip');
    await writeFile(file, 'fixture');
    const fileInfo = { info: info.files[0] };
    const helper = new DownloadedUpdateHelper(dir);
    await helper.setDownloadedFile(
      file,
      null,
      info,
      fileInfo,
      'download.zip',
      false
    );
    assert.equal(
      await helper.validateDownloadedPath(
        file,
        globalThis.structuredClone(info),
        globalThis.structuredClone(fileInfo),
        console
      ),
      file
    );
    for (const changed of [
      { ...info, version: '1.2.4' },
      { ...info, files: [{ ...info.files[0], sha512: 'changed' }] },
      { ...info, releaseNotes: [] },
    ]) {
      assert.equal(
        await helper.validateDownloadedPath(file, changed, fileInfo, console),
        null
      );
    }
    assert.equal(
      await helper.validateDownloadedPath(
        file,
        info,
        { info: { ...fileInfo.info, sha512: 'changed' } },
        console
      ),
      null
    );
    await rm(file);
    assert.equal(
      await helper.validateDownloadedPath(file, info, fileInfo, console),
      null
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(
    'Desktop updater cache validation passed (compatible comparator, equal/changed metadata and missing files).'
  );
};
