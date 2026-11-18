import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroupGreetingModel } from '../src/web/telegram-group-greeting-model.js';
import { greetingGate } from './helpers/greeting-send-fakes.mjs';

const fixture = () => {
  const calls = [];
  let job = null;
  const api = {
    telegramStatus: async () => ({
      kind: 'user',
      capabilities: { chatUsersGreetingsStart: true },
    }),
    telegramChatUsersStatus: async () => ({
      ok: true,
      job,
      results: [],
      users: [],
    }),
    telegramChatUsersGreetingsStart: async (body) => {
      calls.push(['scan', body]);
      job = {
        id: 'scan',
        kind: 'scan',
        state: 'done',
        chat: '-44',
        selector: '@GreetingGroup',
        options: { greetingGroup: true },
      };
      return { ok: true, job };
    },
    telegramChatUsersGreetingsPreview: async (body) => {
      calls.push(['preview', body]);
      return { ok: true, scanId: 'scan', planId: 'reviewed', selected: 2 };
    },
    telegramChatUsersGreetingsApply: async (body) => {
      calls.push(['apply', body]);
      return {
        ok: true,
        job: { id: 'greet', kind: 'greetings', state: 'running' },
      };
    },
    telegramChatUsersCancel: async () => {
      calls.push(['cancel']);
      return { ok: true, job: { state: 'cancelled' } };
    },
  };
  const model = createGroupGreetingModel(api);
  const preview = async () => {
    model.update({ chat: '@GreetingGroup', sticker: '11' });
    await model.scan();
    await model.preview();
  };
  return { api, model, calls, preview };
};
test('opening and polling are read-only; scan, preview and apply require separate explicit actions', async (t) => {
  const { model, calls, preview, api } = fixture();
  t.after(model.stop);
  await model.start();
  await model.load();
  let idleReads = 0;
  const read = model.state.data;
  const status = api.telegramChatUsersStatus;
  api.telegramChatUsersStatus = () => {
    idleReads += 1;
    return status();
  };
  // An idle poll returns without another status request or a busy form.
  assert.equal(await model.poll(), false);
  assert.equal(model.state.data, read);
  assert.equal(model.state.busy, false);
  assert.equal(idleReads, 0);
  assert.equal(calls.length, 0);
  assert.equal(await model.preview(), false);
  await preview();
  assert.deepEqual(calls[1], [
    'preview',
    { jobId: 'scan', limit: 20, delayMs: 30_000, sticker: '11' },
  ]);
  const pending = model.apply();
  assert.equal(model.state.plan, null);
  assert.equal(await model.apply(), false);
  await pending;
  assert.deepEqual(calls[2], ['apply', { planId: 'reviewed', confirm: true }]);
  assert.equal(model.running(), true);
});
test('field edits invalidate frozen plans and a different group cannot reuse an old participant scan', async (t) => {
  const { model, preview, calls } = fixture();
  t.after(model.stop);
  await model.start();
  await preview();
  model.update({ chat: '@AnotherGroup' });
  assert.equal(model.state.plan, null);
  assert.equal(model.ownScan(), false);
  assert.equal(await model.preview(), false);
  assert.equal(await model.apply(), false);
  model.update({ chat: '-44', delayMs: 12 });
  assert.equal(model.ownScan(), true);
  await model.preview();
  model.update({ sticker: '22' });
  assert.equal(model.state.plan, null);
  assert.equal(calls.filter(([kind]) => kind === 'apply').length, 0);
});
test('lost apply responses retain uncertain state and never replay the batch during recovery', async (t) => {
  const { model, api, preview, calls } = fixture();
  t.after(model.stop);
  await model.start();
  await preview();
  api.telegramChatUsersGreetingsApply = async (body) => {
    calls.push(['apply', body]);
    throw new Error('response lost');
  };
  await model.apply();
  assert.equal(model.state.uncertain, true);
  assert.equal(model.state.plan, null);
  await model.load();
  await model.apply();
  assert.equal(calls.filter(([kind]) => kind === 'apply').length, 1);
  assert.equal(model.state.draft.chat, '@GreetingGroup');
  api.telegramChatUsersStatus = async () => ({
    ok: true,
    job: { id: 'greet', planId: 'reviewed', kind: 'greetings', state: 'done' },
    results: [],
  });
  await model.load();
  assert.equal(model.state.uncertain, false);
  assert.equal(calls.filter(([kind]) => kind === 'apply').length, 1);
});
test('capability loss clears old plans and recovery retains the draft without writes', async (t) => {
  const { model, api, preview, calls } = fixture();
  t.after(model.stop);
  await model.start();
  await preview();
  const status = api.telegramStatus;
  api.telegramStatus = async () => ({ kind: 'bot' });
  await model.load();
  assert.equal(model.state.plan, null);
  assert.equal(model.state.availability, 'unavailable');
  api.telegramStatus = status;
  await model.load();
  assert.equal(model.state.draft.chat, '@GreetingGroup');
  assert.equal(calls.length, 2);
});
test('unmount and remount ignore late responses and preserve the new request lock', async (t) => {
  const { model, api } = fixture();
  t.after(model.stop);
  const old = greetingGate();
  const next = greetingGate();
  api.telegramStatus = () => old.promise;
  const first = model.start();
  model.stop();
  api.telegramStatus = () => next.promise;
  const second = model.start();
  old.resolve({ kind: 'bot' });
  await first;
  assert.equal(model.state.busy, true);
  next.resolve({ kind: 'bot' });
  await second;
  assert.equal(model.state.busy, false);
  assert.equal(model.state.availability, 'unavailable');
});
