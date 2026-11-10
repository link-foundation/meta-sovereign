import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGreetingSendModel } from '../src/web/telegram-greeting-send-model.js';
import { greetingGate } from './helpers/greeting-send-fakes.mjs';

const fixture = () => {
  const calls = [];
  const api = {
    telegramStatus: async () => ({
      kind: 'user',
      capabilities: { greetingSendPreview: true },
    }),
    telegramGreetingSendPreview: async (draft) => {
      calls.push(['preview', { ...draft }]);
      return {
        ok: true,
        planId: 'reviewed',
        willSend: true,
        target: { chat: '8' },
      };
    },
    telegramGreetingSendApply: async (body) => {
      calls.push(['apply', body]);
      return { ok: true, status: 'sent', messageId: '7' };
    },
  };
  return { api, calls, model: createGreetingSendModel(api) };
};
test('opening is read-only, selection updates immediately and only explicit Send consumes the reviewed plan', async (t) => {
  const { model, calls } = fixture();
  t.after(model.stop);
  await model.start();
  assert.equal(calls.length, 0);
  model.update({ chat: '@GreetingUser', sticker: '11' });
  await model.preview();
  assert.deepEqual(calls, [
    [
      'preview',
      { chat: '@GreetingUser', sticker: '11', operation: 'greeting-sticker' },
    ],
  ]);
  const sending = model.apply();
  assert.equal(model.state.plan, null);
  assert.equal(await model.apply(), false);
  await sending;
  assert.equal(model.state.result.messageId, '7');
  assert.equal(calls.filter(([kind]) => kind === 'apply').length, 1);
  assert.deepEqual(calls[1][1], { planId: 'reviewed', confirm: true });
});
test('editing invalidates a preview and /start never passes an unrelated cached sticker', async (t) => {
  const { model, calls } = fixture();
  t.after(model.stop);
  await model.start();
  model.update({ chat: '@GreetingUser', sticker: '11' });
  await model.preview();
  model.update({ operation: 'bot-start', chat: '@GreetingBot' });
  assert.equal(model.state.plan, null);
  assert.equal(await model.apply(), false);
  await model.preview();
  assert.equal(calls.at(-1)[1].sticker, null);
});
test('unsupported account kinds and missing capabilities never request a preview or send', async (t) => {
  for (const status of [
    { kind: 'bot', capabilities: { greetingSendPreview: true } },
    { kind: 'user', capabilities: {} },
  ]) {
    const { model, api, calls } = fixture();
    t.after(model.stop);
    api.telegramStatus = async () => status;
    await model.start();
    assert.equal(model.state.availability, 'unavailable');
    await model.preview();
    assert.equal(calls.length, 0);
  }
});
test('failed previews preserve the draft, while lost send responses become uncertain and are never retried', async (t) => {
  const { model, api, calls } = fixture();
  t.after(model.stop);
  await model.start();
  model.update({ chat: '@GreetingUser', sticker: '11' });
  const preview = api.telegramGreetingSendPreview;
  api.telegramGreetingSendPreview = async () => {
    throw new Error('offline');
  };
  assert.equal(await model.preview(), false);
  assert.equal(model.state.draft.chat, '@GreetingUser');
  assert.equal(model.state.draft.sticker, '11');
  api.telegramGreetingSendPreview = preview;
  await model.preview();
  api.telegramGreetingSendApply = async (body) => {
    calls.push(['apply', body]);
    throw new Error('response lost');
  };
  await model.apply();
  assert.equal(model.state.result.status, 'unknown');
  assert.equal(model.state.plan, null);
  assert.equal(await model.apply(), false);
  await model.load();
  assert.equal(calls.filter(([kind]) => kind === 'apply').length, 1);
});
test('a blocked 24-hour or unresolved-outcome preview cannot send', async (t) => {
  const { model, api, calls } = fixture();
  t.after(model.stop);
  api.telegramGreetingSendPreview = async () => ({
    ok: true,
    planId: 'blocked',
    willSend: false,
    delivery: { code: 'already-greeted' },
  });
  await model.start();
  await model.preview();
  assert.equal(await model.apply(), false);
  assert.equal(calls.length, 0);
});
test('unmount and remount reject late responses without clearing a new request lock', async (t) => {
  const { model, api } = fixture();
  t.after(model.stop);
  const old = greetingGate();
  const next = greetingGate();
  api.telegramStatus = () => old.promise;
  const first = model.start();
  model.stop();
  api.telegramStatus = () => next.promise;
  const second = model.start();
  old.resolve({ kind: 'user', capabilities: { greetingSendPreview: true } });
  await first;
  assert.equal(model.state.busy, true);
  assert.equal(model.state.availability, 'loading');
  next.resolve({ kind: 'bot' });
  await second;
  assert.equal(model.state.busy, false);
  assert.equal(model.state.availability, 'unavailable');
});
test('capability loss clears a stale preview while retaining the unsent draft', async (t) => {
  const { model, api } = fixture();
  t.after(model.stop);
  await model.start();
  model.update({ chat: '@GreetingUser' });
  await model.preview();
  api.telegramStatus = async () => ({ kind: 'bot' });
  await model.load();
  assert.equal(model.state.plan, null);
  assert.equal(model.state.draft.chat, '@GreetingUser');
  assert.equal(await model.apply(), false);
});
