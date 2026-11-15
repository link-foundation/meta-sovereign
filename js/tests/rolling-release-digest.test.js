import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { withPackage } from './helpers/rolling-release-fixture.mjs';
import {
  stageServerRelease,
  verifyRelease,
} from '../src/server/rolling-release.js';

test(
  'release hashing overlaps bounded reads and preserves existing manifest identity',
  { timeout: 5000 },
  async () => {
    await withPackage(async (options) => {
      const original = fs.readFile;
      let active = 0;
      let maximum = 0;
      fs.readFile = async (...args) => {
        // Deno's promise shim re-enters readFile with an opened numeric fd.
        // Count application path admissions once, not the shim's inner read.
        if (typeof args[0] === 'number') {
          return original(...args);
        }
        active++;
        maximum = Math.max(maximum, active);
        try {
          await nextTurn();
          return await original(...args);
        } finally {
          active--;
        }
      };
      let release;
      try {
        release = await stageServerRelease(options);
        assert.equal(active, 0);
        assert.ok(
          maximum > 1 && maximum <= 4,
          `read concurrency was ${maximum}`
        );
        await verifyRelease(options.storeDir, release);
      } finally {
        fs.readFile = original;
      }
      const { files } = JSON.parse(
        await fs.readFile(
          path.join(path.dirname(release.entry), '../../release.json')
        )
      );
      const hash = createHash('sha256');
      for (const name of files) {
        hash.update(name);
        hash.update('\0');
        hash.update(await fs.readFile(path.join(options.sourceRoot, name)));
        hash.update('\0');
      }
      assert.equal(release.build, hash.digest('hex'));
    });
  }
);

test(
  'a failed release hash drains issued reads without admitting another batch',
  { timeout: 5000 },
  async () => {
    await withPackage(async (options) => {
      const original = fs.readFile;
      const failure = new Error('private read refusal');
      let releaseReads;
      const gate = new Promise((resolve) => {
        releaseReads = resolve;
      });
      let firstRead;
      const entered = new Promise((resolve) => {
        firstRead = resolve;
      });
      let count = 0;
      let active = 0;
      fs.readFile = async (...args) => {
        if (typeof args[0] === 'number') {
          return original(...args);
        }
        const index = count++;
        active++;
        firstRead();
        try {
          if (index === 0) {
            throw failure;
          }
          await gate;
          return await original(...args);
        } finally {
          active--;
        }
      };
      let settled = false;
      const preparation = stageServerRelease(options)
        .catch((error) => error)
        .finally(() => {
          settled = true;
        });
      try {
        await entered;
        await nextTurn();
        assert.equal(count, 4);
        assert.equal(active, 3);
        assert.equal(settled, false);
      } finally {
        releaseReads();
        const result = await preparation;
        fs.readFile = original;
        assert.equal(result, failure);
      }
      assert.equal(active, 0);
      assert.equal(count, 4);
      assert.equal(
        await fs.stat(path.join(options.storeDir, 'runtime')).catch(() => null),
        null
      );
    });
  }
);
