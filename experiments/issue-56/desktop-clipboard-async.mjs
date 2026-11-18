// Finite native-API model: no clipboard, Electron binary or provider account.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const source = process.argv.includes('--before')
  ? execFileSync('git', ['show', 'c0b31a6c:js/electron/clipboard.js'], {
      encoding: 'utf8',
    })
  : null;
const { attachClipboard } = await import(
  source
    ? `data:text/javascript,${encodeURIComponent(source)}`
    : '../../js/electron/clipboard.js'
);
let invoke;
let finish;
let settled = false;
const contents = {
  isDestroyed: () => false,
  mainFrame: { url: 'http://127.0.0.1:1234/' },
};
const write = new Promise((resolve) => {
  finish = resolve;
});
const dispose = attachClipboard({
  ipcMain: {
    handle: (_channel, handler) => {
      invoke = handler;
    },
    removeHandler() {},
  },
  clipboard: { writeText: () => write },
  contents,
  origin: 'http://127.0.0.1:1234',
});
const receipt = Promise.resolve(
  invoke(
    { sender: contents, senderFrame: contents.mainFrame },
    'synthetic visible log'
  )
).then((answer) => {
  settled = true;
  return answer;
});
try {
  await Promise.resolve();
  console.log(JSON.stringify({ acknowledgedBeforeCompletion: settled }));
  assert.equal(
    settled,
    false,
    'native completion must precede acknowledgement'
  );
} finally {
  finish();
  assert.deepEqual(await receipt, { ok: true });
  dispose();
}
