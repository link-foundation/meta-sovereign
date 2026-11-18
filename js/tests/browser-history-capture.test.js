import test from 'node:test';
import assert from 'node:assert/strict';
import { openBrowserHistoryCapture } from '../src/sources/browser-history-capture.js';
import { bindBrowserHistory } from '../src/sources/browser-history-binding.js';
import {
  historyCaptureFixture,
  historyWriteGate,
} from '../../experiments/issue-56/browser-history-capture-fixture.mjs';
import { archiveBrowserHistoryWindow } from '../src/sources/browser-history-archive.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  withMessageVersions,
  messageVersions,
} from '../src/storage/message-versions.js';

test('rapid overwritten and removed rows retain each native text and delivery observation', async () => {
  const env = historyCaptureFixture();
  const store = withMessageVersions(createMemoryStore());
  const capture = await openBrowserHistoryCapture({
    ...env,
    onHistoryWindow: (window) =>
      archiveBrowserHistoryWindow(store, { ...window, source: 'hh' }),
  });
  try {
    env.change('First draft');
    env.change('Edited answer', 'failed');
    env.change('Final answer', 'delivered');
    env.state.snapshot.messages = [];
    env.state.change();
    await capture.flush();
    const saved = await store.get('msg:hh:7:102');
    assert.equal(saved.body, 'Final answer');
    assert.equal(saved.delivery, 'delivered');
    const versions = await messageVersions(store, saved.id);
    assert.deepEqual(
      new Set(versions.versions.map((v) => v.snapshot.body)),
      new Set(['First draft', 'Edited answer', 'Final answer'])
    );
  } finally {
    await capture.close();
  }
  assert.equal(env.state.connected, false);
  assert.equal(env.state.bindings.size, 0);
});

test('Stop drains admitted snapshots in order and releases the binding exactly once', async () => {
  const env = historyCaptureFixture();
  const gate = historyWriteGate();
  const writes = [];
  let active = 0;
  const capture = await openBrowserHistoryCapture({
    ...env,
    async onHistoryWindow(value) {
      assert.equal(active++, 0);
      if (value.rows[0].id === '102') {
        await gate.promise;
      }
      writes.push(value.rows[0].body);
      active--;
    },
  });
  env.change('A');
  const checkpoint = capture.writeWindow({
    chat: '7',
    rows: [{ id: '102', body: 'Checkpoint', outgoing: true }],
  });
  env.change('B');
  let closed = false;
  const close = capture.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(closed, false);
  assert.equal(env.state.connected, false);
  gate.release();
  await checkpoint;
  await close;
  await capture.close();
  assert.deepEqual(writes, ['Question?', 'A', 'Checkpoint', 'B']);
  assert.equal(env.state.released, 1);
});

test('failed storage is sticky, content-free and prevents another captured write', async () => {
  const env = historyCaptureFixture();
  let writes = 0;
  const capture = await openBrowserHistoryCapture({
    ...env,
    onHistoryWindow() {
      if (++writes > 1) {
        throw new Error('private body and credential value');
      }
    },
  });
  env.change('Private answer');
  await assert.rejects(capture.flush(), {
    code: 'question-history-save-failed',
    message: 'Browser history capture stopped.',
  });
  env.change('Later answer');
  await assert.rejects(capture.flush(), {
    code: 'question-history-save-failed',
  });
  await assert.rejects(capture.close(), {
    code: 'question-history-save-failed',
  });
  assert.equal(writes, 2);
  assert.equal(env.state.bindings.size, 0);
});

test('finite pending snapshot overflow stops capture and is reported even during Stop', async () => {
  const env = historyCaptureFixture();
  const gate = historyWriteGate();
  const capture = await openBrowserHistoryCapture({
    ...env,
    onHistoryWindow: (value) =>
      value.rows[0].id === '102' ? gate.promise : undefined,
  });
  for (let i = 0; i < 66; i++) {
    env.change(`bounded ${i}`);
  }
  assert.equal(env.state.connected, false);
  const closed = assert.rejects(capture.close(), {
    code: 'question-history-capture-gap',
  });
  gate.release();
  await closed;
  assert.equal(env.state.bindings.size, 0);
});

test('page callbacks receive a redacted save refusal instead of private storage errors', async () => {
  const env = historyCaptureFixture();
  let writes = 0;
  const capture = await openBrowserHistoryCapture({
    ...env,
    onHistoryWindow() {
      if (++writes > 1) {
        throw new Error('private path, token and message body');
      }
    },
  });
  const callback = [...env.state.bindings.values()][0];
  await assert.rejects(callback({ chat: '7', rows: [{ id: '102' }] }), {
    code: 'question-history-save-failed',
    message: 'Browser history capture stopped.',
  });
  await assert.rejects(capture.close(), {
    code: 'question-history-save-failed',
  });
  assert.equal(env.state.bindings.size, 0);
});

test('a changed pane stops capture before attributing rows to another chat', async () => {
  const env = historyCaptureFixture();
  const writes = [];
  const capture = await openBrowserHistoryCapture({
    ...env,
    onHistoryWindow: (value) => writes.push(value),
  });
  env.state.snapshot.chat = '8';
  env.state.change();
  await assert.rejects(capture.flush(), { code: 'answer-chat-unverified' });
  await capture.close();
  assert.equal(writes.length, 1);
});

test('frame bindings reject foreign frames and released subscribers without accumulating page hooks', async () => {
  const frame = {};
  let hooks = 0;
  let invoke;
  const page = {
    async exposeBinding(_name, fn) {
      hooks++;
      invoke = fn;
    },
  };
  const values = [];
  const one = await bindBrowserHistory(page, frame, 'one', (v) =>
    values.push(v)
  );
  invoke({ frame }, { token: 'one', snapshot: 'saved' });
  assert.throws(() =>
    invoke({ frame: {} }, { token: 'one', snapshot: 'foreign' })
  );
  one.release();
  assert.throws(() =>
    invoke({ frame }, { token: 'one', snapshot: 'released' })
  );
  const two = await bindBrowserHistory(page, frame, 'two', (v) =>
    values.push(v)
  );
  invoke({ frame }, { token: 'two', snapshot: 'next' });
  two.release();
  assert.equal(hooks, 1);
  assert.deepEqual(values, ['saved', 'next']);
});
