import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/index.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const cases = [
  ['आप कहाँ रहते हैं', 'वियतनाम'],
  ['请介绍您的经验', '五年软件开发经验。'],
];
const seed = async (store) => {
  for (const [id, [question, text]] of cases.entries()) {
    await saveAnswerRule(store, {
      id: `language-${id}`,
      question,
      answers: [{ text, approved: true, count: 2 }],
    });
  }
};

test('CLI and offline UI plan the same Hindi and Chinese saved answers', async () => {
  const store = createMemoryStore();
  await seed(store);
  const cli = createAutomationCommands({ openStore: async () => store });
  const api = questionApi({
    store,
    remote: { get: async () => null, report: async () => null },
  });
  for (const [question, text] of cases) {
    const output = [];
    assert.equal(
      await cli.automations(
        { _: ['answers', 'plan'], question, json: true },
        (line) => output.push(line)
      ),
      0
    );
    const planned = JSON.parse(output.at(-1));
    assert.equal(planned.text, text);
    assert.equal(planned.match, 'exact');
    assert.equal(planned.requiresReview, false);
    const offline = await api.previewAnswer({ question });
    assert.equal(offline.text, text);
    assert.equal(offline.requiresReview, false);
  }
});

test(
  'both default Lino encodings preserve multilingual answer previews',
  { timeout: 20000 },
  async () => {
    const store = createMemoryStore();
    await seed(store);
    const server = await startServer({
      store,
      port: 0,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        for (const [question, text] of cases) {
          const response = await fetch(
            `http://127.0.0.1:${server.port}/api/automations/answers/plan`,
            {
              method: 'POST',
              headers: { accept: type, 'content-type': type },
              body: encodeWire({ question }, type),
            }
          );
          assert.equal(response.status, 200);
          const planned = await readWireResponse(response);
          assert.equal(planned.text, text);
          assert.equal(planned.match, 'exact');
          assert.equal(planned.requiresReview, false);
        }
      }
    } finally {
      await server.close();
    }
  }
);
