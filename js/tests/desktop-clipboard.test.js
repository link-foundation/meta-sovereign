import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import {
  attachClipboard,
  CLIPBOARD_WRITE_CHANNEL,
  MAX_CLIPBOARD_TEXT,
} from '../electron/clipboard.js';
import { createMainWindow } from '../electron/main.js';
import { writeClipboardText } from '../src/web/clipboard-write.js';

const fixture = () => {
  let handler;
  let removed = 0;
  const writes = [];
  const ipcMain = {
    handle: (channel, callback) => {
      assert.equal(channel, CLIPBOARD_WRITE_CHANNEL);
      handler = callback;
    },
    removeHandler: (channel) => {
      assert.equal(channel, CLIPBOARD_WRITE_CHANNEL);
      removed++;
    },
  };
  const clipboard = { writeText: (text) => writes.push(text) };
  const contents = {
    mainFrame: { url: 'http://127.0.0.1:1234/#settings' },
    isDestroyed: () => false,
  };
  const event = { sender: contents, senderFrame: contents.mainFrame };
  return {
    ipcMain,
    clipboard,
    contents,
    event,
    writes,
    invoke: (...args) => handler(...args),
    removed: () => removed,
  };
};

test(
  'desktop clipboard accepts only its owned live main frame and drains its handler',
  { timeout: 5000 },
  () => {
    const f = fixture();
    const dispose = attachClipboard({ ...f, origin: 'http://127.0.0.1:1234' });
    assert.deepEqual(f.invoke(f.event, 'redacted visible log\nsecond line'), {
      ok: true,
    });
    assert.deepEqual(f.writes, ['redacted visible log\nsecond line']);
    for (const event of [
      { ...f.event, sender: {} },
      { ...f.event, senderFrame: { url: f.contents.mainFrame.url } },
      {},
    ]) {
      assert.deepEqual(f.invoke(event, 'refused'), { ok: false });
    }
    for (const url of [
      'https://foreign.invalid/',
      'http://127.0.0.1:4321/',
      'file:///fixture.html',
      'invalid',
    ]) {
      f.contents.mainFrame.url = url;
      assert.deepEqual(f.invoke(f.event, 'refused'), { ok: false });
    }
    f.contents.mainFrame.url = 'http://127.0.0.1:1234/';
    for (const text of [
      undefined,
      {},
      42,
      'x'.repeat(MAX_CLIPBOARD_TEXT + 1),
    ]) {
      assert.deepEqual(f.invoke(f.event, text), { ok: false });
    }
    f.contents.isDestroyed = () => true;
    assert.deepEqual(f.invoke(f.event, 'refused'), { ok: false });
    f.contents.isDestroyed = () => false;
    dispose();
    dispose();
    assert.equal(f.removed(), 1);
    assert.deepEqual(f.invoke(f.event, 'refused'), { ok: false });
    assert.equal(f.writes.length, 1);
  }
);

test(
  'native clipboard refusal has no successful receipt or sensitive diagnostics',
  { timeout: 5000 },
  () => {
    const f = fixture();
    f.clipboard.writeText = () => {
      throw new Error('fixture_private_value');
    };
    attachClipboard({ ...f, origin: 'http://127.0.0.1:1234' });
    assert.deepEqual(f.invoke(f.event, 'fixture_private_value'), { ok: false });
  }
);

test(
  'preload exposes a bounded-purpose copy invocation without raw IPC or read access',
  { timeout: 5000 },
  async () => {
    let exposed;
    const calls = [];
    runInNewContext(
      readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8'),
      {
        require: () => ({
          contextBridge: {
            exposeInMainWorld: (name, value) => {
              assert.equal(name, 'metaSovereignShell');
              exposed = value;
            },
          },
          ipcRenderer: {
            invoke: async (...args) => {
              calls.push(args);
              return { ok: true };
            },
          },
        }),
        process: { env: {} },
      }
    );
    assert.deepEqual(Object.keys(exposed).sort(), [
      'copyText',
      'discoveryCandidates',
      'platform',
    ]);
    assert.deepEqual(await exposed.copyText('visible'), { ok: true });
    assert.deepEqual(calls, [[CLIPBOARD_WRITE_CHANNEL, 'visible']]);
  }
);

test(
  'UI uses acknowledged native copying with browser fallback only when no desktop bridge exists',
  { timeout: 5000 },
  async () => {
    const calls = [];
    const clipboard = {
      writeText: async (text) => {
        calls.push(['web', text]);
      },
    };
    const shell = {
      platform: 'electron',
      copyText: async (text) => {
        calls.push(['desktop', text]);
        return { ok: true };
      },
    };
    await writeClipboardText('visible', { shell, clipboard });
    assert.deepEqual(calls, [['desktop', 'visible']]);
    for (const receipt of [undefined, {}, { ok: false }, { ok: 'true' }]) {
      shell.copyText = async () => receipt;
      await assert.rejects(
        writeClipboardText('visible', { shell, clipboard }),
        /clipboard unavailable/u
      );
    }
    shell.copyText = async () => {
      throw new Error('refused');
    };
    await assert.rejects(writeClipboardText('visible', { shell, clipboard }));
    assert.equal(calls.length, 1, 'native refusal never silently falls back');
    await writeClipboardText('web visible', { shell: {}, clipboard });
    await writeClipboardText('legacy visible', {
      shell: { platform: 'electron' },
      clipboard,
    });
    assert.deepEqual(calls.slice(1), [
      ['web', 'web visible'],
      ['web', 'legacy visible'],
    ]);
  }
);

test(
  'main window owns the bridge before its page loads and releases it on close or failed load',
  { timeout: 5000 },
  async () => {
    for (const failed of [false, true]) {
      const f = fixture();
      let window;
      class Window extends EventEmitter {
        constructor() {
          super();
          window = this;
          this.webContents = f.contents;
        }
        async loadURL() {
          assert.deepEqual(f.invoke(f.event, 'during load'), { ok: true });
          if (failed) {
            throw new Error('fixture failed load');
          }
        }
        destroy() {
          this.emit('closed');
        }
      }
      const opening = createMainWindow({
        ...f,
        BrowserWindow: Window,
        port: 1234,
      });
      if (failed) {
        await assert.rejects(opening, /fixture failed load/u);
      } else {
        await opening;
        window.destroy();
      }
      assert.equal(f.removed(), 1);
      assert.deepEqual(f.invoke(f.event, 'after close'), { ok: false });
    }
  }
);
