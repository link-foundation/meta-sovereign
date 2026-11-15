import { writeFile } from 'node:fs/promises';

const [mode, ...values] = process.argv.slice(2);
if (mode === 'argv') {
  process.stdout.write(JSON.stringify(values));
} else if (mode === 'large') {
  process.stdout.write('x'.repeat(80000));
} else if (mode === 'cancel') {
  const deadline = globalThis.setTimeout(() => process.exit(2), 3000);
  process.once('SIGTERM', () => {
    globalThis.setTimeout(async () => {
      await writeFile(values[0], 'drained');
      globalThis.clearTimeout(deadline);
      process.exit(0);
    }, 30);
  });
  await writeFile(values[1], 'ready');
} else {
  throw new Error('Unknown finite fixture.');
}
