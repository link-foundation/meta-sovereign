// Bounded probe for abrupt Windows Deno exits when loading the native addon
// in successive test workers. No Telegram connection or account is needed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'issue43-cifrante-'));
const entry = fileURLToPath(new URL('../package.json', import.meta.url));
try {
  const source = `
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
Deno.test('finite AES-IGE native-addon probe', () => {
  console.log('before require');
  const { IGE } = createRequire(${JSON.stringify(entry)})('teleproto/crypto/IGE.js');
  console.log('before construction');
  const cipher = new IGE(Buffer.alloc(32, 1), Buffer.alloc(32, 2));
  console.log('before encryption', IGE.backend());
  const input = Buffer.alloc(144, 3);
  const encrypted = cipher.encryptIge(input);
  console.log('before decryption');
  assert.deepEqual(cipher.decryptIge(encrypted), input);
  cipher.dispose();
  console.log('after disposal');
});
`;
  const files = [0, 1, 2].map((i) => join(dir, `probe${i}.test.js`));
  for (const file of files) {
    await writeFile(file, source);
  }
  const results = [];
  for (const mode of ['default', 'portable']) {
    const env = { ...process.env, RUST_BACKTRACE: '1' };
    if (mode === 'portable') {
      env.CIFRANTE_NATIVE = '0';
    } else {
      delete env.CIFRANTE_NATIVE;
    }
    const child = spawnSync(
      'deno',
      [
        'test',
        '--no-config',
        '--no-check',
        '--allow-all',
        '--v8-flags=--max-old-space-size=384',
        ...files,
      ],
      {
        env,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      }
    );
    console.log(
      JSON.stringify({
        mode,
        status: child.status,
        signal: child.signal,
        error: child.error?.message,
      })
    );
    console.log(child.stdout, child.stderr);
    results.push(child.status);
  }
  assert.deepEqual(
    results,
    [0, 0],
    'Both default and portable AES probes must pass'
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
