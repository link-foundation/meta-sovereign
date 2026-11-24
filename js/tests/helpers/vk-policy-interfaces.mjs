import assert from 'node:assert/strict';
import { createMemoryStore } from '../../src/storage/universal.js';
import { dictionaries } from '../../src/web/locales/index.js';
import { LINO_BINARY } from '../../src/transport/lino.js';
import { createWirePost } from './http-wire.mjs';

export const assertVkDeliveryAndSaveRetention = async (
  fixture,
  path,
  policy,
  changed,
  verifyEffects
) => {
  const post = createWirePost(fixture.base, path, LINO_BINARY);
  const { plan } = (await post('/plan', {})).answer;
  assert.equal(
    (await post('/run', { planId: plan.planId, confirm: true })).answer.last
      .status,
    'confirmed'
  );
  verifyEffects(fixture.effects);
  fixture.refuseWrites(true);
  const before = await policy.settings(fixture.store);
  await assert.rejects(policy.save(fixture.store, { ...before, ...changed }));
  assert.deepEqual(await policy.settings(fixture.store), before);
};

export const assertVkOwnedCommandRun = async (
  owned,
  adapter,
  invalid,
  verifyEffects
) => {
  const { command, log, answer, closed } = owned;
  assert.equal(await command({ _: ['plan'] }, log), 0);
  const plan = answer().plan.planId;
  await assert.rejects(command({ _: ['run'], plan }, log), /Confirm/);
  assert.equal(adapter.effects.length, 0);
  assert.equal(await command({ _: ['run'], plan, confirm: true }, log), 0);
  verifyEffects(adapter.effects);
  await assert.rejects(command({ _: ['save'], ...invalid }, log));
  assert.equal(closed(), 5);
};

export const assertReviewedVkPlan = async (post, settings) => {
  assert.equal(
    (await post('', settings, 'https://foreign.invalid')).status,
    403
  );
  assert.deepEqual((await post('', settings)).answer.settings, settings);
  const { plan } = (await post('/plan', {})).answer;
  assert.equal((await post('/run', { planId: plan.planId })).status, 400);
  assert.equal((await post('/run', { scheduled: true })).status, 400);
  return plan;
};

export const offlineVkPolicy = (factory) => {
  const store = createMemoryStore();
  const api = factory({
    get: async () => null,
    report: async () => null,
    local: async () => store,
  });
  return { store, api };
};

export const assertVkTranslations = (
  prefix,
  keys,
  { complete = false } = {}
) => {
  const expected = complete
    ? Object.keys(dictionaries.en).filter((key) => key.startsWith(`${prefix}.`))
    : [];
  for (const dictionary of Object.values(dictionaries)) {
    for (const key of [...expected, ...keys.map((key) => `${prefix}.${key}`)]) {
      assert.equal(typeof dictionary[key], 'string', key);
      assert.ok(dictionary[key].length, key);
    }
  }
};

export const ownedVkCommand = (factory, name, store, createJob) => {
  let closed = 0;
  let answer;
  store.close = async () => {
    closed++;
  };
  const command = factory({
    openStore: async () => store,
    openReadOnly: async () => store,
    ...(createJob ? { createJob } : {}),
  })[name];
  return {
    command,
    closed: () => closed,
    answer: () => answer,
    log: (value) => {
      answer = JSON.parse(value);
    },
  };
};
