// Bounded Windows Deno native-addon reproduction. The default verifies the
// application fix and portable backend. --raw-native deliberately reproduces
// the unguarded native crash in a child. No Telegram account/network is used.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'issue43-cifrante-'));
const entry = fileURLToPath(new URL('../package.json', import.meta.url));
const runtime = new URL(
  '../js/src/sources/telegram-runtime.js',
  import.meta.url
);
try {
  const source = `
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
Deno.test('finite AES-IGE native-addon probe', async () => {
  if (process.env.ISSUE43_CRYPTO_MODE === 'application') {
    const { configureTelegramCrypto } = await import(${JSON.stringify(runtime.href)});
    configureTelegramCrypto();
  }
  console.log('before require');
  const { IGE } = createRequire(${JSON.stringify(entry)})('teleproto/crypto/IGE.js');
  console.log('before construction');
  const cipher = new IGE(Buffer.alloc(32, 1), Buffer.alloc(32, 2));
  console.log('before encryption', IGE.backend());
  if (Deno.build.os === 'windows' && process.env.ISSUE43_CRYPTO_MODE !== 'raw-native') {
    assert.equal(IGE.backend(), 'wasm');
  }
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
  const modes = process.argv.includes('--raw-native')
    ? ['raw-native']
    : ['application', 'portable'];
  for (const mode of modes) {
    const env = {
      ...process.env,
      RUST_BACKTRACE: '1',
      ISSUE43_CRYPTO_MODE: mode,
    };
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
    modes.map(() => 0),
    'Every requested AES probe must pass (raw native is a deliberate reproduction)'
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
