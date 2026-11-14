import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

const question = 'Расскажите о вашем опыте с Kubernetes.';
const answer = 'Сопровождал кластер из 12 узлов.';
const planning = [
  [
    'Where do you live?',
    'Thanks for the details! Where do you live?',
    'Vietnam',
    false,
  ],
  [
    'Describe your database backup process.',
    'Describe your database backup process.',
    'Yes.',
    true,
  ],
];
const seed = async (store) => {
  for (const [index, [question, , text]] of planning.entries()) {
    await saveAnswerRule(store, {
      id: `turn-control-${index}`,
      question,
      answers: [{ text, approved: true }],
    });
  }
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    for (const [id, sender, body] of [
      [1, 'them', question],
      [2, 'them', 'Мы можем продолжить наше общение?'],
      [3, 'owner', 'Здравствуйте!'],
      [4, 'owner', answer],
    ]) {
      await store.put({
        id: `msg:${source}:turns:${id}`,
        source,
        chat: 'turns',
        sender,
        body,
        timestamp: `2026-11-09T10:00:0${id}Z`,
      });
    }
  }
};
const verify = (result) => {
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0].question, question);
  const actual = result.rules[0].answers[0];
  assert.equal(actual.text, answer);
  assert.equal(actual.count, 5);
  assert.equal(actual.approved, false);
  assert.equal(actual.evidence.length, 5);
  assert(actual.evidence.every((id) => id.endsWith(':4')));
};

test('CLI and offline UI share bounded reminder learning without approval or count inflation', async () => {
  const store = createMemoryStore();
  await seed(store);
  const cli = createAutomationCommands({ openStore: async () => store });
  const output = [];
  assert.equal(
    await cli.automations(
      { _: ['answers', 'learn'], self: 'owner', json: true },
      (line) => output.push(line)
    ),
    0
  );
  verify(JSON.parse(output.at(-1)));
  assert.equal(
    (await store.query((link) => link.id?.startsWith('qa-rule:'))).length,
    2
  );
  const offline = questionApi({
    store,
    remote: { get: async () => null, report: async () => null },
  });
  verify(await offline.learnAnswers({ self: ['owner'], apply: true }));
  verify(await offline.learnAnswers({ self: ['owner'], apply: true }));
  for (const [, question, text, review] of planning) {
    const output = [];
    await cli.automations(
      { _: ['answers', 'plan'], question, json: true },
      (line) => output.push(line)
    );
    for (const result of [
      JSON.parse(output.at(-1)),
      await offline.previewAnswer({ question }),
    ]) {
      assert.equal(result.question, question);
      assert.equal(result.requiresReview, review);
      assert.equal(result.complete, !review);
      assert.equal(result.text, review ? '' : text);
    }
  }
});

test(
  'both Lino encodings preserve question identity, actual answer provenance and transcripts',
  { timeout: 20000 },
  async () => {
    const store = createMemoryStore();
    await seed(store);
    const before = await store.query((link) => link.id?.startsWith('msg:'));
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
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/automations/answers/learn`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire({ self: ['owner'], apply: true }, type),
          }
        );
        assert.equal(response.status, 200);
        verify(await readWireResponse(response));
        for (const [, question, text, review] of planning) {
          const planned = await fetch(
            `http://127.0.0.1:${server.port}/api/automations/answers/plan`,
            {
              method: 'POST',
              headers: { accept: type, 'content-type': type },
              body: encodeWire({ question }, type),
            }
          );
          assert.equal(planned.status, 200);
          const result = await readWireResponse(planned);
          assert.equal(result.question, question);
          assert.equal(result.requiresReview, review);
          assert.equal(result.complete, !review);
          assert.equal(result.text, review ? '' : text);
        }
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
