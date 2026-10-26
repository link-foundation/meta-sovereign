// A packaged Electron app can read ASAR resources, but an external
// compiler cannot. Both Swift source and linker resources need real files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileSwiftHelper } from '../src/server/native-helper.js';

test('native builds stage bundled inputs and share a cached executable', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-native-build-'));
  const source = path.join(root, 'contact.swift');
  const plist = path.join(root, 'contact.plist');
  const dir = path.join(root, 'cache');
  let builds = 0;
  let stagedSource;
  try {
    await fs.writeFile(source, 'import Contacts');
    await fs.writeFile(plist, '<plist/>');
    const options = {
      dir,
      name: 'contacts',
      source,
      extraFiles: [plist],
      extraArgs: ['-Xlinker', plist],
      run: async (command, args) => {
        builds += 1;
        assert.equal(command, 'xcrun');
        stagedSource = args[2];
        assert.notEqual(stagedSource, source);
        assert.equal(
          await fs.readFile(stagedSource, 'utf8'),
          'import Contacts'
        );
        const stagedPlist = args[args.indexOf('-Xlinker') + 1];
        assert.notEqual(stagedPlist, plist);
        assert.equal(await fs.readFile(stagedPlist, 'utf8'), '<plist/>');
        await fs.writeFile(args[args.indexOf('-o') + 1], 'executable');
        return { status: 0 };
      },
    };
    const [first, concurrent] = await Promise.all([
      compileSwiftHelper(options),
      compileSwiftHelper(options),
    ]);
    assert.equal(first, concurrent);
    assert.equal(await compileSwiftHelper(options), first);
    assert.equal(builds, 1);
    await assert.rejects(fs.access(stagedSource));
    await fs.access(first, fs.constants.X_OK);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
