import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { withMessageVersions } from '../src/storage/message-versions.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

test(
  'CLI, offline UI and both Lino APIs share full-archive counts and read-only previews',
  { timeout: 15000 },
  async () => {
    const store = withMessageVersions(createMemoryStore());
    for (const source of ['hh', 'vk']) {
      for (const [id, sender, body] of [
        [1, 'them', 'Where do you live?'],
        [2, 'owner', source === 'hh' ? 'Thailand.' : 'Vietnam.'],
      ]) {
        await store.put({
          id: `msg:${source}:1:${id}`,
          source,
          chat: '1',
          sender,
          body,
          timestamp: `2026-11-09T10:00:0${id}Z`,
        });
      }
    }
    const answer = await store.get('msg:hh:1:2');
    await store.put({
      ...answer,
      body: 'Vietnam.',
      edited: '2026-11-10T10:00:00Z',
    });
    const assertHistory = (result) => {
      assert.equal(result.coverage.scope, 'archive');
      assert.equal(result.coverage.retained, 4);
      assert.equal(result.coverage.incompleteRevisionChains, 0);
      assert.deepEqual(
        Object.fromEntries(
          result.rules[0].answers.map(({ text, count }) => [text, count])
        ),
        { 'Vietnam.': 2, 'Thailand.': 1 }
      );
      assert.ok(result.rules[0].answers.every((reply) => !reply.approved));
    };
    const commands = createAutomationCommands({ openStore: async () => store });
    const output = [];
    await commands.automations(
      { _: ['answers', 'learn'], self: 'owner', json: true },
      (line) => output.push(line)
    );
    const preview = JSON.parse(output[0]);
    assertHistory(preview);
    assert.equal(
      (await store.query((link) => link.id.startsWith('qa-rule:'))).length,
      0
    );
    const offline = questionApi({
      store,
      remote: { get: async () => null, report: async () => null },
    });
    const saved = await offline.learnAnswers({ self: ['owner'], apply: true });
    assertHistory(saved);
    const server = await startServer({
      store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/automations/answers/learn`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire({ self: ['owner'], apply: true }, type),
          }
        );
        assert.equal(response.status, 200);
        const result = await readWireResponse(response);
        assert.equal(result.coverage.limited, false);
        assertHistory(result);
      }
    } finally {
      await server.close();
    }
  }
);
