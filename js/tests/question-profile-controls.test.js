import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { profileCv } from '../../experiments/issue-56/question-profile-fixture.mjs';
import { startServer } from '../src/server/index.js';
import { api as browserApi } from '../src/web/dom.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

test('the production browser bridge exposes profile import controls', () => {
  assert.equal(typeof browserApi.answerProfileSources, 'function');
  assert.equal(typeof browserApi.extractAnswerProfile, 'function');
});

test(
  'CLI and offline controls extract a selected stored CV without writing',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await store.put(profileCv);
    const cli = createAutomationCommands({ openStore: async () => store });
    const lines = [];
    assert.equal(
      await cli.automations(
        { _: ['answers', 'profile'], cv: 'hh', json: true },
        (line) => lines.push(line)
      ),
      0
    );
    const result = JSON.parse(lines.at(-1));
    assert.equal(result.profile.email, 'cv-owner@example.test');
    const offline = questionApi({
      store,
      remote: { get: async () => null, report: async () => null },
    });
    assert.deepEqual(
      await offline.extractAnswerProfile({ cvId: 'cv:hh' }),
      result
    );
    assert.equal((await store.query(() => true)).length, 1);
  }
);

test(
  'text and binary Lino share read-only profile extraction and scoped source discovery',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await store.put(profileCv);
    const server = await startServer({
      store,
      port: 0,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const base = `http://127.0.0.1:${server.port}/api/automations/answers`;
        const sources = await fetch(`${base}/profile-sources`, {
          headers: { accept: type },
        });
        assert.equal(sources.status, 200);
        assert.equal((await readWireResponse(sources)).sources[0].id, 'cv:hh');
        const response = await fetch(`${base}/profile`, {
          method: 'POST',
          headers: { accept: type, 'content-type': type },
          body: encodeWire(
            { cvId: 'cv:hh', text: 'Email: contact-owner@example.test' },
            type
          ),
        });
        assert.equal(response.status, 200);
        const result = await readWireResponse(response);
        assert.equal(result.profile.email, undefined);
        assert.equal(
          result.fields.find((field) => field.key === 'email').conflict,
          true
        );
        const invalid = await fetch(`${base}/profile`, {
          method: 'POST',
          headers: { accept: type, 'content-type': type },
          body: encodeWire({ cvId: 'secret:example' }, type),
        });
        assert.equal(invalid.status, 400);
        assert.match(
          (await readWireResponse(invalid)).error,
          /cv: identifier/u
        );
      }
      assert.equal((await store.query(() => true)).length, 1);
    } finally {
      await server.close();
    }
  }
);

test(
  'malformed extraction replies fail without changing the local profile source',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await store.put(profileCv);
    const base = {
      readOnly: true,
      requiresReview: true,
      profile: {},
      fields: [],
      skipped: [],
    };
    for (const reply of [
      {},
      { ...base, profile: [] },
      { ...base, fields: [null] },
      {
        ...base,
        fields: [
          {
            key: 'email',
            candidates: [{ value: 'owner@example.test', evidence: [null] }],
          },
        ],
      },
    ]) {
      const api = questionApi({ store, remote: { report: async () => reply } });
      await assert.rejects(
        api.extractAnswerProfile({ cvId: 'cv:hh' }),
        /invalid profile extraction response/u
      );
    }
    assert.deepEqual(await store.get('cv:hh'), profileCv);
  }
);

test(
  'remote extraction refusals preserve offline data instead of claiming a local success',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await store.put(profileCv);
    const api = questionApi({
      store,
      remote: {
        get: async () => null,
        report: async () => ({ error: 'Profile fixture refusal' }),
      },
    });
    await assert.rejects(
      api.extractAnswerProfile({ cvId: 'cv:hh' }),
      /fixture refusal/u
    );
    assert.equal((await store.query(() => true)).length, 1);
  }
);
