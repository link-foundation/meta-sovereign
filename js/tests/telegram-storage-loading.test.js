import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runModuleScript } from './helpers/run-module-script.js';

const layer = new URL('../src/sources/telegram-layer.js', import.meta.url).href;

test('Telegram imports leave unused browser storage untouched and retain disk sessions', () => {
  const out = runModuleScript(`
    let reads = 0;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { reads += 1; return undefined; },
    });
    const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const { importTelegram } = await import(${JSON.stringify(layer)});
    const telegram = await importTelegram();
    const { MemorySession, StringSession, Session } = telegram.sessions;
    const importedReads = reads;
    const string = new StringSession('');
    const disk = telegram.sessions.StoreSession;
    const { createRequire } = await import('node:module');
    const require = createRequire(${JSON.stringify(layer)});
    const local = createRequire(require.resolve('teleproto/sessions'));
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const folder = mkdtempSync(join(tmpdir(), 'ms-telegram-storage-'));
    let persisted = false;
    try {
      const first = new disk(join(folder, 'session'));
      first.setDC(2, '127.0.0.1', 443);
      const reopened = new disk(join(folder, 'session'));
      await reopened.load();
      persisted = reopened.dcId === 2 && reopened.serverAddress === '127.0.0.1';
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
    const after = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    console.log(JSON.stringify({
      importedReads,
      diskAvailable: typeof disk === 'function',
      diskIdentity: disk === local('./StoreSession').StoreSession,
      persisted,
      memory: string instanceof MemorySession,
      session: string instanceof Session,
      unchanged: before.get === after.get,
      repeat: (await importTelegram()) === telegram,
    }));
  `);
  const result = JSON.parse(out.trim().split('\n').pop());
  assert.equal(result.importedReads, 0);
  for (const key of [
    'diskAvailable',
    'diskIdentity',
    'persisted',
    'memory',
    'session',
    'unchanged',
    'repeat',
  ]) {
    assert.equal(result[key], true, key);
  }
});

test('real Telegram imports emit no native storage warnings', () => {
  const out = runModuleScript(`
    const warnings = [];
    process.on('warning', (warning) => warnings.push(warning.message));
    const { importTelegram } = await import(${JSON.stringify(layer)});
    await importTelegram();
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log(JSON.stringify(warnings.filter((message) => message.includes('localStorage'))));
  `);
  assert.deepEqual(JSON.parse(out.trim().split('\n').pop()), []);
});
