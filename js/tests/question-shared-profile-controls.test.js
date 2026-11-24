import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { api as browserApi } from '../src/web/dom.js';
import { startServer } from '../src/server/index.js';
import {
  encodeWire,
  encodeLinoValue,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import {
  saveAnswerProfile,
  readAnswerProfile,
} from '../src/automation/question-profiles.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { toForm, checkForm } from '../src/web/automations-model.js';
import { normalizeAutomation } from '../src/automation/automations.js';

const input = {
  id: 'owner',
  name: 'Owner contacts',
  values: { email: 'owner@example.test' },
};

test('the production browser bridge exposes reusable profile controls', () => {
  for (const name of [
    'answerProfiles',
    'readAnswerProfile',
    'saveAnswerProfile',
    'deleteAnswerProfile',
  ]) {
    assert.equal(typeof browserApi[name], 'function', name);
  }
});

test(
  'CLI and offline controls share profile revision checks and current previews',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const cli = createAutomationCommands({ openStore: async () => store });
    const output = [];
    const run = async (args) => {
      await cli.automations({ ...args, json: true }, (line) =>
        output.push(line)
      );
      return JSON.parse(output.at(-1));
    };
    const { profile } = await run({
      _: ['answers', 'profiles', 'save', 'owner'],
      name: input.name,
      values: encodeLinoValue(input.values),
    });
    assert.equal(profile.id, 'qa-profile:owner');
    const api = questionApi({
      remote: { get: async () => null, report: async () => null },
      store,
    });
    assert.equal((await api.answerProfiles())[0].id, profile.id);
    assert.deepEqual(await api.readAnswerProfile(profile.id), { profile });
    const next = (
      await api.saveAnswerProfile({
        ...profile,
        values: { email: 'current@example.test' },
      })
    ).profile;
    await assert.rejects(api.saveAnswerProfile(profile), /changed/u);
    await saveAnswerRule(store, {
      id: 'email',
      question: 'What is your email?',
      answers: [{ text: '{{email}}', approved: true }],
    });
    const preview = await run({
      _: ['answers', 'plan'],
      question: 'What is your email?',
      'profile-id': 'owner',
    });
    assert.equal(preview.text, 'current@example.test');
    assert.equal(preview.profileSource.revision, next.revision);
    const listed = await run({ _: ['answers', 'profiles', 'list'] });
    assert.equal(Object.hasOwn(listed.profiles[0], 'values'), false);
    assert.equal(
      (await run({ _: ['answers', 'profiles', 'show', 'owner'] })).profile
        .revision,
      next.revision
    );
    await run({
      _: ['answers', 'profiles', 'delete', 'owner'],
      revision: next.revision,
    });
    await assert.rejects(api.readAnswerProfile(profile.id), /missing/u);
  }
);

test(
  'text and binary Lino expose profile CRUD with stale-write refusals',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    const server = await startServer({
      store,
      port: 0,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    const root = `http://127.0.0.1:${server.port}/api/automations/answers/profiles`;
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = async (action, body, status = 200) => {
          const response = await fetch(`${root}/${action}`, {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire(body, type),
          });
          assert.equal(response.status, status);
          return readWireResponse(response);
        };
        const { profile } = await post('save', input);
        assert.deepEqual(
          (await post('read', { id: profile.id })).profile,
          profile
        );
        const list = await fetch(root, { headers: { accept: type } });
        const metadata = (await readWireResponse(list)).profiles[0];
        assert.equal(metadata.id, profile.id);
        assert.equal(Object.hasOwn(metadata, 'values'), false);
        const next = (await post('save', { ...profile, name: 'Current name' }))
          .profile;
        assert.match((await post('save', profile, 400)).error, /changed/u);
        assert.match((await post('delete', profile, 400)).error, /changed/u);
        assert.equal(
          (await readAnswerProfile(store, profile.id)).name,
          next.name
        );
        assert.equal((await post('delete', next)).deleted, next.id);
        assert.match(
          (await post('read', { id: next.id }, 400)).error,
          /missing/u
        );
      }
    } finally {
      await server.close();
    }
  }
);

test('editor round trips keep the profile reference and local overrides separately', () => {
  const original = normalizeAutomation({
    id: 'profile',
    action: {
      kind: 'answer-questions',
      profileId: 'owner',
      profile: { city: 'Hanoi' },
    },
  });
  const form = toForm(original);
  assert.equal(form.profileId, 'qa-profile:owner');
  assert.deepEqual(form.profile, { city: 'Hanoi' });
  const { automation, error } = checkForm(form, original);
  assert.equal(error, undefined);
  assert.deepEqual(automation.action, original.action);
  form.profileId = '';
  assert.equal(
    checkForm(form, original).automation.action.profileId,
    undefined
  );
});

test('remote refusals and malformed acknowledgments never become local profile success', async () => {
  const store = createMemoryStore();
  const profile = await saveAnswerProfile(store, input);
  for (const result of [
    { error: 'Fixture refusal' },
    {},
    { profile: {} },
    { profile: { ...profile, values: [] } },
  ]) {
    const api = questionApi({
      store,
      remote: { report: async () => result, get: async () => result },
    });
    await assert.rejects(
      api.saveAnswerProfile({ ...profile, name: 'Unsaved' })
    );
    await assert.rejects(api.readAnswerProfile(profile.id));
    await assert.rejects(api.deleteAnswerProfile(profile));
    await assert.rejects(api.answerProfiles());
    assert.deepEqual(await readAnswerProfile(store, profile.id), profile);
  }
});

test('profile acknowledgments must identify the requested source and saved values', async () => {
  const store = createMemoryStore();
  const profile = await saveAnswerProfile(store, input);
  const saved = { ...profile, revision: globalThis.crypto.randomUUID() };
  const { values: _values, ...missingValues } = saved;
  for (const reply of [
    missingValues,
    { ...saved, id: 'qa-profile:other' },
    { ...saved, values: { email: 'other@example.test' } },
    { ...saved, name: 'Other name' },
    profile,
  ]) {
    const api = questionApi({
      store,
      remote: { report: async () => ({ profile: reply }) },
    });
    await assert.rejects(api.saveAnswerProfile(profile));
  }
  const api = questionApi({
    store,
    remote: {
      report: async () => ({ profile: { ...saved, id: 'qa-profile:other' } }),
    },
  });
  await assert.rejects(api.readAnswerProfile(profile.id), /identity/u);
  assert.deepEqual(await readAnswerProfile(store, profile.id), profile);
});
