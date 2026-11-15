/** Finite trace of the runtime's filesystem shim, using a private 14-file fixture. */
import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { withPackage } from '../../js/tests/helpers/rolling-release-fixture.mjs';
import { stageServerRelease } from '../../js/src/server/rolling-release.js';

await withPackage(async (options) => {
  const original = fs.readFile;
  const calls = [];
  let active = 0;
  let maximum = 0;
  fs.readFile = async (...args) => {
    active++;
    maximum = Math.max(maximum, active);
    if (calls.length < 12) {
      calls.push({
        file: basename(String(args[0])),
        stack: new Error().stack.split('\n').slice(1, 5),
      });
    }
    try {
      await nextTurn();
      return await original(...args);
    } finally {
      active--;
    }
  };
  try {
    await stageServerRelease(options);
    console.log(JSON.stringify({ maximum, active, calls }, null, 2));
  } finally {
    fs.readFile = original;
  }
});
