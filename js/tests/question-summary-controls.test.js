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
  summary,
  summaryMessage,
} from '../../experiments/issue-56/question-summary-fixture.mjs';

const seed = async () => {
  const store = createMemoryStore();
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    await store.put(summaryMessage(source));
  }
  return store;
};
const verify = (result) => {
  assert.equal(result.rules.length, 2);
  for (const rule of result.rules) {
    assert.equal(rule.answers[0].count, 0);
    assert.equal(rule.answers[0].approved, false);
    assert.equal(rule.answers[0].evidence.length, 5);
  }
};

test('CLI and offline UI share completed-summary facts without observed-send inflation', async () => {
  const store = await seed();
  const before = await store.query((link) => link.id?.startsWith('msg:'));
  const cli = createAutomationCommands({ openStore: async () => store });
  const output = [];
  await cli.automations({ _: ['answers', 'learn'], json: true }, (line) =>
    output.push(line)
  );
  verify(JSON.parse(output.at(-1)));
  const offline = questionApi({
    store,
    remote: { get: async () => null, report: async () => null },
  });
  verify(await offline.learnAnswers({ apply: true }));
  verify(await offline.learnAnswers({ apply: true }));
  assert.equal(
    (await offline.previewAnswer({ question: summary })).noReply,
    true
  );
  const answer = await offline.previewAnswer({
    question: 'Есть ли у вас опыт использования Rust?',
  });
  assert.equal(answer.text, 'Нет.');
  assert.equal(answer.count, 0);
  assert.equal(answer.requiresReview, true);
  assert.deepEqual(
    await store.query((link) => link.id?.startsWith('msg:')),
    before
  );
});

test(
  'actual text and binary Lino routes preserve zero-count facts and no-reply planning',
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
          ['plan', { question: summary }],
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
            verify(result);
          } else {
            assert.equal(result.noReply, true);
          }
        }
      }
    } finally {
      await server.close();
    }
  }
);
