import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { questionApi } from '../src/web/question-api.js';
import { normalizeAnswerRule } from '../src/automation/question-answers.js';
import {
  encodeWire,
  decodeWire,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const input = {
  id: 'qa-rule:city',
  question: 'City?',
  answers: [{ text: 'Owner edit', approved: true }],
};
const saved = normalizeAnswerRule(input);
const setup = (reply) => {
  const store = createMemoryStore();
  return {
    store,
    api: questionApi({
      store,
      remote: {
        get: async () => reply,
        report: async () => reply,
      },
    }),
  };
};

test('unconfirmed answer saves are refused without falling back to local writes', async () => {
  for (const reply of [
    {},
    [],
    true,
    'not a receipt',
    { rule: null },
    { rule: { ...saved, id: 'qa-rule:other' } },
    { rule: { ...saved, answers: [{ text: 'Old answer' }] } },
    { rule: { ...saved, question: 'Other question?' } },
    { rule: saved, ok: false },
    { rule: saved, httpStatus: 500 },
    { 0: 'error', 1: 'Malformed refusal', httpStatus: 500 },
  ]) {
    const { api, store } = setup(reply);
    await assert.rejects(api.saveAnswerRule(input));
    assert.deepEqual(await store.query(), []);
  }
});

test('malformed or refused answer lists never reach the rule editor', async () => {
  for (const reply of [
    {},
    [],
    { rules: [null] },
    { rules: [{}] },
    { rules: [saved, { ...saved, id: 'wrong' }] },
    { rules: Array.from({ length: 1001 }, () => saved) },
    { rules: [saved], error: 'Unavailable' },
    { rules: [saved], httpStatus: 500 },
  ]) {
    await assert.rejects(setup(reply).api.answerRules());
  }
});

test('answer deletion requires the requested rule identity', async () => {
  for (const reply of [
    {},
    { deleted: 'qa-rule:other' },
    { deleted: input.id, httpStatus: 500 },
  ]) {
    await assert.rejects(setup(reply).api.deleteAnswerRule(input.id));
  }
  assert.deepEqual(
    await setup({ deleted: input.id }).api.deleteAnswerRule('city'),
    { deleted: input.id }
  );
});

test('confirmed text and binary Lino rule receipts retain normalized editor values', async () => {
  for (const type of [LINO_TEXT, LINO_BINARY]) {
    const reply = decodeWire(encodeWire({ rule: saved }, type), type);
    assert.deepEqual(await setup(reply).api.saveAnswerRule(input), reply);
    assert.deepEqual(await setup({ rules: [saved] }).api.answerRules(), [
      saved,
    ]);
  }
});

test('explicit contraction can return its server-rendered template', async () => {
  const contracted = {
    ...saved,
    answers: [{ ...saved.answers[0], text: '{{city}}' }],
  };
  assert.deepEqual(
    await setup({ rule: contracted }).api.saveAnswerRule({
      ...input,
      contract: true,
    }),
    { rule: contracted }
  );
});

test('offline rule editing retains the existing explicit local storage path', async () => {
  const { api } = setup(null);
  assert.deepEqual((await api.saveAnswerRule(input)).rule, saved);
  assert.deepEqual(await api.answerRules(), [saved]);
  await api.deleteAnswerRule('city');
  assert.deepEqual(await api.answerRules(), []);
});
