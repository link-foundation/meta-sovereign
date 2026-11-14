// Finite CLI output probe: one version line with an asynchronous stdout sink.
import { Console } from 'node:console';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const stdout = process.stdout;
const delayed = new Writable({
  write(chunk, _encoding, done) {
    setTimeout(() => stdout.write(chunk, done), 25);
  },
});
globalThis.console = new Console({ stdout: delayed, stderr: process.stderr });
const entry = new URL('../../js/bin/meta-sovereign.js', import.meta.url);
process.argv = [
  process.execPath,
  fileURLToPath(entry),
  process.argv[2] ?? '--version',
];
await import(entry.href);
