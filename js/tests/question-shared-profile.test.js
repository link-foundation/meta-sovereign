import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  saveAnswerRule,
  previewAnswer,
  learnSavedAnswers,
  listAnswerRules,
} from '../src/automation/question-store.js';
import {
  saveAnswerProfile,
  readAnswerProfile,
  listAnswerProfiles,
  deleteAnswerProfile,
} from '../src/automation/question-profiles.js';
import {
  normalizeAutomation,
  planAutomation,
} from '../src/automation/automations.js';
import { createAutomationRunner } from '../src/automation/runner.js';

const question = 'What is your email?';
const newProfile = (store) =>
  saveAnswerProfile(store, {
    id: 'owner',
    name: 'Owner contacts',
    values: { email: 'first@example.test' },
  });
const rule = {
  id: 'qa-rule:shared-email',
  question,
  answers: [{ text: '{{email}}', approved: true }],
};
const incoming = (source, id = 1, sender = 'them', body = question) => ({
  id: `msg:${source}:1:${id}`,
  source,
  chat: '1',
  sender,
  body,
  timestamp: `2026-11-10T11:00:0${id}Z`,
});
const automation = (profileId) =>
  normalizeAutomation({
    id: 'shared-profile',
    action: { kind: 'answer-questions', profileId },
    conditions: { mutual: false, cooldownDays: 0 },
  });

test('a named profile supplies current values instead of per-automation copies', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, {
    id: 'shared-email',
    question: 'What is your email?',
    answers: [{ text: '{{email}}', approved: true }],
  });
  const record = {
    id: 'qa-profile:owner',
    name: 'Owner contacts',
    revision: '00000000-0000-4000-8000-000000000001',
    updatedAt: '2026-11-10T11:00:00.000Z',
    values: { email: 'first@example.test' },
  };
  await store.put(record);
  const input = { question: 'What is your email?', profileId: record.id };
  assert.equal((await previewAnswer(store, input)).text, 'first@example.test');
  await store.put({ ...record, values: { email: 'current@example.test' } });
  assert.equal(
    (await previewAnswer(store, input)).text,
    'current@example.test'
  );
});

test(
  'named profile revisions reject stale writers, stale deletion and delete/recreate ABA',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const first = await newProfile(store);
    const next = await saveAnswerProfile(store, {
      ...first,
      name: 'Current name',
    });
    assert.notEqual(next.revision, first.revision);
    await assert.rejects(saveAnswerProfile(store, first), /changed/u);
    await assert.rejects(deleteAnswerProfile(store, first), /changed/u);
    assert.equal((await readAnswerProfile(store, 'owner')).name, next.name);
    await deleteAnswerProfile(store, next);
    const recreated = await newProfile(store);
    assert.notEqual(recreated.revision, next.revision);
    await assert.rejects(saveAnswerProfile(store, next), /changed/u);
    await assert.rejects(deleteAnswerProfile(store, next), /changed/u);
    assert.deepEqual(await listAnswerProfiles(store), [
      {
        id: recreated.id,
        name: recreated.name,
        updatedAt: recreated.updatedAt,
        revision: recreated.revision,
      },
    ]);
  }
);

test(
  'concurrent saves sharing a store admit exactly one expected revision',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const first = await newProfile(store);
    const results = await Promise.allSettled([
      saveAnswerProfile(store, { ...first, name: 'First writer' }),
      saveAnswerProfile(store, { ...first, name: 'Second writer' }),
    ]);
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1
    );
    assert.equal(
      (await readAnswerProfile(store, first.id)).name,
      'First writer'
    );
  }
);

test('pure planning resolves current shared values across providers and retains explicit overrides', async () => {
  const store = createMemoryStore();
  const first = await newProfile(store);
  const configured = automation(first.id);
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    const before = JSON.stringify(configured);
    const options = { self: ['me'], targets: [{ source, chat: '1' }] };
    const plan = planAutomation(
      [first, rule, incoming(source)],
      configured,
      options
    );
    assert.equal(plan.drafts[0].text, 'first@example.test', source);
    assert.equal(plan.drafts[0].answer.profileSource.revision, first.revision);
    const overridden = planAutomation(
      [first, rule, incoming(source)],
      {
        ...configured,
        action: {
          ...configured.action,
          profile: { email: 'local@example.test' },
        },
      },
      options
    );
    assert.equal(overridden.drafts[0].text, 'local@example.test');
    assert.deepEqual(overridden.drafts[0].answer.profileSource.overriddenKeys, [
      'email',
    ]);
    assert.equal(
      JSON.stringify(configured),
      before,
      'planning never copies shared values into the action'
    );
    assert.throws(
      () => planAutomation([rule, incoming(source)], configured, options),
      /missing/u
    );
  }
});

test('removed references block standalone previews even when local overrides exist', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, rule);
  await assert.rejects(
    previewAnswer(store, {
      question,
      profileId: 'missing',
      profile: { email: 'stale@example.test' },
    }),
    /missing/u
  );
  assert.equal(
    (
      await previewAnswer(store, {
        question,
        profile: { email: 'local@example.test' },
      })
    ).text,
    'local@example.test'
  );
  for (const profileId of [42, false, {}, '../outside', 'secret:owner']) {
    assert.throws(() => automation(profileId), /identifier/u);
  }
});

test('saved answers and archived learning contract the selected shared profile', async () => {
  const store = createMemoryStore();
  const profile = await newProfile(store);
  const saved = await saveAnswerRule(store, {
    ...rule,
    contract: true,
    profileId: profile.id,
    answers: [{ text: 'Write to first@example.test.', approved: true }],
  });
  assert.equal(saved.answers[0].text, 'Write to {{email}}.');
  for (const message of [
    incoming('hh'),
    incoming('hh', 2, 'me', 'Write to first@example.test.'),
  ]) {
    await store.put(message);
  }
  const learned = await learnSavedAnswers(store, {
    contract: true,
    profileId: profile.id,
  });
  assert.equal(learned.rules[0].answers[0].text, 'Write to {{email}}.');
  const current = await saveAnswerProfile(store, {
    ...profile,
    values: { email: 'current@example.test' },
  });
  const preview = await previewAnswer(store, {
    question,
    profileId: current.id,
  });
  assert.equal(preview.text, 'Write to current@example.test.');
});

test(
  'profile edits while reading an archive invalidate contraction before any write, including query-only stores',
  { timeout: 5000 },
  async () => {
    for (const subscriptions of [true, false]) {
      const store = createMemoryStore();
      const profile = await newProfile(store);
      if (!subscriptions) {
        delete store.subscribe;
        delete store.scan;
      }
      for (const message of [
        incoming('hh'),
        incoming('hh', 2, 'me', 'first@example.test'),
      ]) {
        await store.put(message);
      }
      const get = store.get;
      let changed = false;
      store.get = async (id, project) => {
        if (!changed && id.startsWith('msg:')) {
          changed = true;
          await saveAnswerProfile(store, {
            ...profile,
            values: { email: 'current@example.test' },
          });
        }
        return get(id, project);
      };
      await assert.rejects(
        learnSavedAnswers(store, {
          contract: true,
          profileId: profile.id,
          apply: true,
        }),
        /knowledge changed/u
      );
      assert.deepEqual(await listAnswerRules(store), []);
      assert.equal(
        (await readAnswerProfile(store, profile.id)).values.email,
        'current@example.test'
      );
    }
  }
);

test(
  'profile changes or deletion during typing block delivery before an outbox claim',
  { timeout: 5000 },
  async () => {
    for (const deleted of [false, true]) {
      const store = createMemoryStore();
      const profile = await newProfile(store);
      const configured = automation(profile.id);
      for (const record of [configured, rule, incoming('hh')]) {
        await store.put(record);
      }
      let sent = 0;
      const runner = createAutomationRunner({
        store,
        self: ['me'],
        sleep: async () =>
          deleted
            ? deleteAnswerProfile(store, profile)
            : saveAnswerProfile(store, {
                ...profile,
                values: { email: 'current@example.test' },
              }),
        send: async () => {
          sent++;
          return { status: 'sent' };
        },
      });
      const plan = await runner.plan(configured, {
        targets: [{ source: 'hh', chat: '1' }],
      });
      const outcome = await runner.deliverDraft(configured, plan.drafts[0]);
      assert.equal(outcome.code, 'answer-review-required');
      assert.equal(sent, 0);
      assert.deepEqual(
        await store.query((link) => link.id.startsWith('outbox:')),
        []
      );
    }
  }
);

test('named profiles enforce finite names, fields, record count and metadata-only discovery', async () => {
  const store = createMemoryStore();
  for (const input of [
    { id: '../outside', name: 'Name' },
    { id: 'owner', name: ' ' },
    { id: 'owner', name: 'x'.repeat(121) },
    { id: 'owner', name: 'Name', values: { email: 42 } },
    { id: 'owner', name: 'Name', values: { email: 'x'.repeat(2001) } },
  ]) {
    await assert.rejects(saveAnswerProfile(store, input));
  }
  assert.deepEqual(await listAnswerProfiles(store), []);
  const profile = await newProfile(store);
  for (let index = 1; index < 50; index++) {
    await store.put({ ...profile, id: `qa-profile:owner-${index}` });
  }
  assert.equal((await listAnswerProfiles(store)).length, 50);
  await assert.rejects(
    saveAnswerProfile(store, { id: 'extra', name: 'Extra', values: {} }),
    /capacity/u
  );
  const metadata = await listAnswerProfiles(store);
  assert.equal(
    metadata.some((entry) => Object.hasOwn(entry, 'values')),
    false
  );
});
