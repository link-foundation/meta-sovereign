import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  stageServerRelease,
  verifyRelease,
} from '../src/server/rolling-release.js';

const withPackage = async (run) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-release-copy-'));
  const sourceRoot = path.join(dir, 'package');
  const storeDir = path.join(dir, 'store');
  try {
    for (const name of [
      'js/src/nested',
      'js/bin',
      'node_modules/lino-objects-codec',
    ]) {
      await fs.mkdir(path.join(sourceRoot, name), { recursive: true });
    }
    await fs.writeFile(
      path.join(sourceRoot, 'package.json'),
      '{"type":"module"}'
    );
    await fs.writeFile(
      path.join(sourceRoot, 'js/bin/server-worker.js'),
      '// fixture'
    );
    for (let i = 0; i < 12; i += 1) {
      await fs.writeFile(
        path.join(sourceRoot, `js/src/nested/file-${i}.js`),
        `export const value = ${i};`
      );
    }
    await run({ sourceRoot, storeDir, dir });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

test(
  'immutable snapshots avoid repeated directory calls and bound parallel copies',
  { timeout: 5000 },
  async () => {
    await withPackage(async (options) => {
      const original = { mkdir: fs.mkdir, copyFile: fs.copyFile };
      const directories = [];
      let active = 0;
      let maximum = 0;
      let copies = 0;
      fs.mkdir = async (...args) => {
        directories.push(args[0]);
        return original.mkdir(...args);
      };
      fs.copyFile = async (...args) => {
        copies += 1;
        active += 1;
        maximum = Math.max(maximum, active);
        try {
          await nextTurn();
          return await original.copyFile(...args);
        } finally {
          active -= 1;
        }
      };
      let release;
      try {
        release = await stageServerRelease(options);
        assert.equal(active, 0);
        assert.ok(
          maximum > 1 && maximum <= 4,
          `copy concurrency was ${maximum}`
        );
        assert.equal(new Set(directories).size, directories.length);
        assert.equal(copies, 14);
        assert.deepEqual(
          await verifyRelease(options.storeDir, release),
          release
        );
        const copied = copies;
        assert.deepEqual(await stageServerRelease(options), release);
        assert.equal(copies, copied, 'verified existing snapshots are reused');
      } finally {
        Object.assign(fs, original);
      }
      assert.equal(
        await fs.readFile(
          path.join(path.dirname(release.entry), '../src/nested/file-11.js'),
          'utf8'
        ),
        'export const value = 11;'
      );
    });
  }
);

test(
  'one pending snapshot copy does not idle the other three slots',
  { timeout: 5000 },
  async () => {
    await withPackage(async (options) => {
      const original = fs.copyFile;
      let releaseCopy;
      const gate = new Promise((resolve) => {
        releaseCopy = resolve;
      });
      let firstCopy;
      const started = new Promise((resolve) => {
        firstCopy = resolve;
      });
      let copies = 0;
      let active = 0;
      let maximum = 0;
      fs.copyFile = async (...args) => {
        copies += 1;
        active += 1;
        maximum = Math.max(maximum, active);
        try {
          // Tiny fixture files use synchronous copies so the scheduling
          // assertion depends only on the explicit gate, never disk timing.
          copyFileSync(...args);
          if (copies === 1) {
            firstCopy();
            await gate;
          } else {
            await Promise.resolve();
          }
        } finally {
          active -= 1;
        }
      };
      const preparation = stageServerRelease(options);
      let release;
      try {
        await started;
        await nextTurn();
        assert.equal(copies, 14, 'all unblocked copies finished');
        assert.equal(active, 1, 'only the explicitly gated copy remains');
        assert.ok(maximum <= 4, `copy concurrency was ${maximum}`);
      } finally {
        releaseCopy();
        try {
          release = await preparation;
        } finally {
          fs.copyFile = original;
        }
      }
      assert.equal(active, 0);
      await verifyRelease(options.storeDir, release);
    });
  }
);

test(
  'copy failure waits for issued writes before cleanup and publishes no release',
  { timeout: 5000 },
  async () => {
    await withPackage(async (options) => {
      const original = fs.copyFile;
      const failure = new Error('fixture copy failure');
      let releaseCopies;
      const gate = new Promise((resolve) => {
        releaseCopies = resolve;
      });
      let firstCopy;
      const started = new Promise((resolve) => {
        firstCopy = resolve;
      });
      let copies = 0;
      let active = 0;
      let settled = false;
      fs.copyFile = async (...args) => {
        copies += 1;
        if (copies === 1) {
          firstCopy();
          throw failure;
        }
        active += 1;
        try {
          await gate;
          return await original(...args);
        } finally {
          active -= 1;
        }
      };
      const preparation = stageServerRelease(options).then(
        () => {
          settled = true;
          return null;
        },
        (error) => {
          settled = true;
          return error;
        }
      );
      try {
        await started;
        await nextTurn();
        assert.equal(copies, 4);
        assert.equal(active, 3);
        assert.equal(
          settled,
          false,
          'preparation still owns the issued writes'
        );
      } finally {
        releaseCopies();
        const error = await preparation;
        fs.copyFile = original;
        assert.equal(error, failure);
      }
      assert.equal(active, 0);
      assert.deepEqual(
        await fs.readdir(path.join(options.storeDir, 'runtime/releases')),
        []
      );
      const recovered = await stageServerRelease(options);
      await verifyRelease(options.storeDir, recovered);
    });
  }
);

test(
  'source edits during copying refuse the complete snapshot and allow a fresh retry',
  { timeout: 5000 },
  async () => {
    await withPackage(async (options) => {
      const original = fs.copyFile;
      let edited = false;
      fs.copyFile = async (...args) => {
        if (!edited) {
          edited = true;
          await fs.writeFile(args[0], '// changed during staging');
        }
        return original(...args);
      };
      try {
        await assert.rejects(
          stageServerRelease(options),
          /files changed while preparing/
        );
      } finally {
        fs.copyFile = original;
      }
      assert.deepEqual(
        await fs.readdir(path.join(options.storeDir, 'runtime/releases')),
        []
      );
      const release = await stageServerRelease(options);
      await verifyRelease(options.storeDir, release);
    });
  }
);
