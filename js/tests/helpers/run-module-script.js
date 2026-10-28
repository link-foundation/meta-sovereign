// Runs an ES-module script in a fresh process of the runtime that runs the
// tests (node, bun or deno), so it gets a module cache nothing has touched
// (R-Z6). `node --input-type=module -e` does not exist on Deno, so the
// script goes through a temporary file, which all three run the same way.
// The file lives inside the project (under node_modules/.cache, which is
// not tracked) so that Deno finds deno.json and package.json dependencies.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPTS = path.join(ROOT, 'node_modules', '.cache', 'ms-scripts');

export const runModuleScript = (source, { env } = {}) => {
  mkdirSync(SCRIPTS, { recursive: true });
  const dir = mkdtempSync(path.join(SCRIPTS, 'run-'));
  try {
    const file = path.join(dir, 'script.mjs');
    writeFileSync(file, source);
    const args = globalThis.Deno ? ['run', '-A', file] : [file];
    return execFileSync(process.execPath, args, {
      encoding: 'utf8',
      cwd: ROOT,
      ...(env ? { env: { ...process.env, ...env } } : {}),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // Say why the child failed: the default message only names the command.
    throw new Error(
      `${error.message}\n${error.status} ${error.stdout} ${error.stderr ?? ''}`,
      {
        cause: error,
      }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
