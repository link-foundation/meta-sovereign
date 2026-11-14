import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import { listAnswerRules } from '../src/automation/question-store.js';
import { QA_POLICY_ID } from '../src/automation/question-policy.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

const pausedArchive = async () => {
  const store = createMemoryStore();
  for (const [id, sender, body] of [
    [1, 'them', 'Where do you live?'],
    [2, 'me', 'Vietnam.'],
  ]) {
    await store.put({
      id: `msg:hh:1:${id}`,
      source: 'hh',
      chat: '1',
      sender,
      body,
      timestamp: `2026-11-09T10:00:0${id}Z`,
    });
  }
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const get = store.get;
  let held = false;
  store.get = async (id, project) => {
    if (!held && id.startsWith('msg:')) {
      held = true;
      entered.resolve();
      await release.promise;
    }
    return get(id, project);
  };
  return { store, entered: entered.promise, release: release.resolve };
};

test(
  'concurrent CLI rejection additions retain both phrases',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const cli = createAutomationCommands({ openStore: async () => store });
    await Promise.all(
      ['Vietnam', 'Thailand'].map((reject) =>
        cli.automations({ _: ['answers', 'policy'], reject }, () => {})
      )
    );
    assert.deepEqual(
      new Set((await store.get(QA_POLICY_ID)).rejected),
      new Set(['Vietnam', 'Thailand'])
    );
  }
);

test(
  'offline UI rejects a scan invalidated by a concurrent CLI policy edit',
  { timeout: 5000 },
  async () => {
    const { store, entered, release } = await pausedArchive();
    const offline = questionApi({
      store,
      remote: { get: async () => null, report: async () => null },
    });
    const learning = offline.learnAnswers({ apply: true });
    const rejected = assert.rejects(learning, /knowledge changed/iu);
    try {
      await entered;
      const cli = createAutomationCommands({ openStore: async () => store });
      await cli.automations(
        { _: ['answers', 'policy'], reject: 'Vietnam' },
        () => {}
      );
    } finally {
      release();
    }
    await rejected;
    assert.deepEqual(await listAnswerRules(store), []);
  }
);

test(
  'text and binary Lino report concurrent knowledge changes without applying stale rules',
  { timeout: 15000 },
  async () => {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const { store, entered, release } = await pausedArchive();
      const server = await startServer({
        store,
        port: 0,
        telegramAccount: false,
        enableHandlers: false,
        enableSync: false,
        automations: { scheduler: false },
      });
      const call = async (action, input) => {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/automations/answers/${action}`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire(input, type),
          }
        );
        return {
          status: response.status,
          body: await readWireResponse(response),
        };
      };
      const learning = call('learn', { apply: true });
      try {
        await entered;
        const policy = await call('policy', { rejected: ['Vietnam'] });
        assert.equal(policy.status, 200);
        release();
        const result = await learning;
        assert.equal(result.status, 400);
        assert.match(result.body.error, /knowledge changed/iu);
        assert.deepEqual(await listAnswerRules(store), []);
      } finally {
        release();
        await learning;
        await server.close();
      }
    }
  }
);
