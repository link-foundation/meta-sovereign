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
import {
  questionnaireMessages,
  questions,
} from '../../experiments/issue-56/question-lists-fixture.mjs';

const seed = async () => {
  const store = createMemoryStore();
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    for (const message of questionnaireMessages(source)) {
      await store.put(message);
    }
  }
  return store;
};
const verify = (result) => {
  assert.equal(result.rules.length, 3);
  assert.equal(result.coverage.retained, 10);
  for (const rule of result.rules) {
    assert.equal(rule.answers[0].count, 5);
    assert.equal(rule.answers[0].approved, false);
    assert.equal(rule.answers[0].evidence.length, 5);
  }
  assert(result.rules.some((rule) => rule.question === questions));
  assert(result.rules.some((rule) => rule.question === 'Where do you live?'));
};

test('CLI and offline UI share aligned archive learning without inflating counts or changing transcripts', async () => {
  const store = await seed();
  const before = await store.query((link) => link.id?.startsWith('msg:'));
  const cli = createAutomationCommands({ openStore: async () => store });
  const output = [];
  await cli.automations({ _: ['answers', 'learn'], json: true }, (line) =>
    output.push(line)
  );
  verify(JSON.parse(output.at(-1)));
  assert.equal(
    (await store.query((link) => link.id?.startsWith('qa-rule:'))).length,
    0
  );
  const offline = questionApi({
    store,
    remote: { get: async () => null, report: async () => null },
  });
  verify(await offline.learnAnswers({ apply: true }));
  verify(await offline.learnAnswers({ apply: true }));
  const plan = await offline.previewAnswer({ question: 'Where do you live?' });
  assert.equal(plan.text, 'Hanoi.');
  assert.equal(plan.requiresReview, true);
  assert.deepEqual(
    await store.query((link) => link.id?.startsWith('msg:')),
    before
  );
});

test(
  'text and binary Lino preserve whole and component provenance and unapproved answers',
  { timeout: 10000 },
  async () => {
    const store = await seed();
    const before = await store.query((link) => link.id?.startsWith('msg:'));
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
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/automations/answers/learn`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire({ apply: true }, type),
          }
        );
        assert.equal(response.status, 200);
        verify(await readWireResponse(response));
      }
      assert.deepEqual(
        await store.query((link) => link.id?.startsWith('msg:')),
        before
      );
    } finally {
      await server.close();
    }
  }
);
