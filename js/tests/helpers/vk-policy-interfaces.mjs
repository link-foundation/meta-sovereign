import assert from 'node:assert/strict';
import { createMemoryStore } from '../../src/storage/universal.js';
import { dictionaries } from '../../src/web/locales/index.js';

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
