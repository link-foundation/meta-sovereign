import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const builder = createRequire(require.resolve('electron-builder'));
const entry = pathToFileURL(builder.resolve('app-builder-lib'));
const { getNodeModuleFileMatcher } = await import(
  new URL('./fileMatcher.js', entry)
);
const { verifyNativeBinaries } = await import(
  new URL('./util/nativeBinaryVerifier.js', entry)
);
const { Arch } = await import('builder-util');
const config = require('../../desktop/electron-builder.config.cjs');
const prebuilds = ['darwin', 'linux', 'linuxmusl', 'win32'].flatMap(
  (platform) => ['x64', 'arm64'].map((arch) => `${platform}-${arch}.node`)
);

const filterFor = (key, arch) => {
  const matcher = getNodeModuleFileMatcher(
    '/fixture',
    '/output',
    (pattern) => pattern.replaceAll('${arch}', arch),
    config[key],
    { config, debugLogger: { isEnabled: false } }
  );
  // NodeModuleCopyHelper treats an empty matcher as an unrestricted copy.
  return matcher.isEmpty() ? () => true : matcher.createFilter();
};
const includes = (filter, relative) =>
  filter(join('/fixture', relative), {
    isDirectory: () => false,
    moduleFullFilePath: relative,
  });

for (const [key, platform] of [
  ['linux', 'linux'],
  ['mac', 'darwin'],
  ['win', 'win32'],
]) {
  for (const arch of ['x64', 'arm64']) {
    test(`desktop ${platform} ${arch} copies only compatible SQLite prebuilds`, () => {
      const filter = filterFor(key, arch);
      const expected = [`${platform}-${arch}.node`];
      if (platform === 'linux') {
        expected.push(`linuxmusl-${arch}.node`);
      }
      for (const prefix of [
        'node_modules/',
        'node_modules/provider/node_modules/',
      ]) {
        const actual = prebuilds.filter((name) =>
          includes(filter, `${prefix}better-sqlite3/prebuilds/${name}`)
        );
        assert.deepEqual(actual.sort(), expected.sort());
      }
      for (const relative of [
        'node_modules/better-sqlite3/lib/binding.js',
        'node_modules/better-sqlite3/package.json',
        'node_modules/portable-provider/runtime.wasm',
        'node_modules/other-addon/build/Release/addon.node',
        'js/src/server/index.js',
      ]) {
        assert.ok(includes(filter, relative), relative);
      }
    });
  }
}

// Finite recognizable headers reproduce the installed builder's actual gate.
// These 8 x 80-byte fixtures are never loaded as executable addons.
const binaryHeader = (name) => {
  const header = Buffer.alloc(80);
  const arm64 = name.includes('arm64');
  if (name.startsWith('linux')) {
    header.writeUInt32BE(0x7f454c46, 0);
    header[5] = 1;
    header.writeUInt16LE(arm64 ? 183 : 62, 18);
  } else if (name.startsWith('darwin')) {
    header.writeUInt32BE(0xfeedfacf, 0);
    header.writeUInt32BE(arm64 ? 0x0100000c : 0x01000007, 4);
  } else {
    header.write('MZ');
    header.writeUInt32LE(64, 0x3c);
    header.writeUInt32LE(0x00004550, 64);
    header.writeUInt16LE(arm64 ? 0xaa64 : 0x8664, 68);
  }
  return header;
};

test(
  'filtered SQLite passes the real native verifier and unrelated mismatches still fail',
  { timeout: 5000 },
  async () => {
    const resourcesDir = await mkdtemp(
      join(tmpdir(), 'desktop-native-filter-')
    );
    try {
      const root = join(resourcesDir, 'app.asar.unpacked');
      const relative = 'node_modules/better-sqlite3/prebuilds';
      await mkdir(join(root, relative), { recursive: true });
      const filter = filterFor('linux', 'x64');
      for (const name of prebuilds) {
        if (includes(filter, `${relative}/${name}`)) {
          await writeFile(join(root, relative, name), binaryHeader(name));
        }
      }
      const target = {
        resourcesDir,
        platform: 'linux',
        arch: Arch.x64,
        mode: config.nativeModules?.verifyNativeBinaries,
      };
      await verifyNativeBinaries(target);
      const unrelated = join(root, 'node_modules/other-addon/build/Release');
      await mkdir(unrelated, { recursive: true });
      await writeFile(
        join(unrelated, 'addon.node'),
        binaryHeader('win32-arm64.node')
      );
      await assert.rejects(
        verifyNativeBinaries(target),
        /wrong platform\/architecture/
      );
    } finally {
      await rm(resourcesDir, { recursive: true, force: true });
    }
  }
);
