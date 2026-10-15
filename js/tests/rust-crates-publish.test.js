/**
 * Guard for issue #39: the Rust workspace crates are the app's alternative
 * server and its WebAssembly build, not libraries for crates.io. Each one
 * must say `publish = false`, so `cargo publish` refuses it and registry
 * scans stop listing it as an unpublished crate.
 */

import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const cratesDir = path.join(repoRoot, 'rust/crates');

// The `[package]` table runs from its header to the next table header.
const packageTable = (manifest) => {
  const match = manifest.match(/^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m);
  return match ? match[1] : '';
};

describe('issue #39 Rust crates are not published to crates.io', () => {
  it('marks every workspace crate publish = false', async () => {
    const crates = (await fs.readdir(cratesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(crates).toEqual([
      'meta-sovereign-core',
      'meta-sovereign-server',
      'meta-sovereign-wasm',
    ]);

    for (const crate of crates) {
      const manifest = await fs.readFile(
        path.join(cratesDir, crate, 'Cargo.toml'),
        'utf8'
      );
      const publishLine = packageTable(manifest).match(
        /^\s*publish\s*=\s*(.+?)\s*$/m
      );
      expect([crate, publishLine && publishLine[1]]).toEqual([crate, 'false']);
    }
  });
});
