import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import {
  correctionMessages,
  correctedRules,
  searchQuestion,
  searchAnswer,
} from '../../experiments/issue-56/question-corrections-fixture.mjs';

const seed = async () => {
  const store = createMemoryStore();
  for (const rule of correctedRules) {
    await saveAnswerRule(store, rule);
  }
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    for (const message of correctionMessages(source)) {
      await store.put(message);
    }
  }
  return store;
};
const verify = (result) => {
  assert.equal(result.text, searchAnswer);
  assert.equal(result.count, 0);
  assert.deepEqual(
    result.alternatives.map((answer) => answer.text),
    [searchAnswer]
  );
};

test('CLI and offline UI never relearn corrected historical wording or inflate owner corrections', async () => {
  const store = await seed();
  const cli = createAutomationCommands({ openStore: async () => store });
  const output = [];
  await cli.automations(
    { _: ['answers', 'learn'], apply: true, json: true },
    (line) => output.push(line)
  );
  assert.deepEqual(JSON.parse(output.at(-1)).rules, []);
  const offline = questionApi({
    store,
    remote: { get: async () => null, report: async () => null },
  });
  assert.deepEqual((await offline.learnAnswers({ apply: true })).rules, []);
  verify(await offline.previewAnswer({ question: searchQuestion }));
});

test(
  'actual text and binary Lino learning and planning share owner correction exclusions',
  { timeout: 10000 },
  async () => {
    const store = await seed();
    const server = await startServer({
      store,
      port: 0,
      telegramAccount: false,
      enableHandlers: false,
      enableSync: false,
      automations: { scheduler: false },
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        for (const [action, input] of [
          ['learn', { apply: true }],
          ['plan', { question: searchQuestion }],
        ]) {
          const response = await fetch(
            `http://127.0.0.1:${server.port}/api/automations/answers/${action}`,
            {
              method: 'POST',
              headers: { accept: type, 'content-type': type },
              body: encodeWire(input, type),
            }
          );
          assert.equal(response.status, 200);
          const result = await readWireResponse(response);
          if (action === 'learn') {
            assert.deepEqual(result.rules, []);
          } else {
            verify(result);
          }
        }
      }
    } finally {
      await server.close();
    }
  }
);
