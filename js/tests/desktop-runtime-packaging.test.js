import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDesktopRuntime } from '../scripts/validate-desktop-runtime.mjs';

test(
  'desktop runtime validation refuses dependencies resolved from a surrounding checkout',
  { timeout: 5000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'desktop-dependency-boundary-'));
    try {
      const out = join(dir, 'app');
      await mkdir(join(out, 'node_modules'), { recursive: true });
      const external = join(dir, 'node_modules', 'finite-fixture-dependency');
      await mkdir(external, { recursive: true });
      await writeFile(join(external, 'index.js'), 'module.exports = true;');
      await writeFile(
        join(out, 'package.json'),
        JSON.stringify({
          dependencies: { 'finite-fixture-dependency': '1.0.0' },
        })
      );
      await assert.rejects(
        validateDesktopRuntime(out),
        /Desktop dependency escaped the staged app/
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);
