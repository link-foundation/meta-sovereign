import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/index.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const question = 'What is your email?';
const profile = { email: 'owner@example.test' };
const rule = {
  id: 'email',
  question,
  contract: true,
  profile,
  answers: [{ text: 'Write to owner@example.test.', approved: true }],
};

test(
  'CLI and offline UI save and expand the same configured substitutions',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const cli = createAutomationCommands({ openStore: async () => store });
    const lines = [];
    assert.equal(
      await cli.automations(
        {
          _: ['answers', 'save'],
          id: 'email',
          question,
          answer: rule.answers[0].text,
          approved: true,
          contract: true,
          profile: encodeWire(profile),
          json: true,
        },
        (line) => lines.push(line)
      ),
      0
    );
    assert.equal(
      JSON.parse(lines.at(-1)).rule.answers[0].text,
      'Write to {{email}}.'
    );
    const offline = questionApi({
      store,
      remote: { get: async () => null, report: async () => null },
    });
    const saved = await offline.saveAnswerRule(rule);
    assert.equal(saved.rule.answers[0].text, 'Write to {{email}}.');
    const result = await offline.previewAnswer({
      question,
      profile: { email: 'next@example.test' },
    });
    assert.equal(result.text, 'Write to next@example.test.');
    assert.equal(result.requiresReview, false);
  }
);

test(
  'both Lino APIs contract saves and learning without persisting profile values',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    for (const [id, sender, body] of [
      [1, 'them', question],
      [2, 'me', rule.answers[0].text],
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
    const server = await startServer({
      store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    const call = async (action, value, type) => {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/automations/answers/${action}`,
        {
          method: 'POST',
          headers: { accept: type, 'content-type': type },
          body: encodeWire(value, type),
        }
      );
      assert.equal(response.status, 200);
      return readWireResponse(response);
    };
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const saved = await call('save', { rule }, type);
        assert.equal(saved.rule.answers[0].text, 'Write to {{email}}.');
        assert.equal(saved.rule.profile, undefined);
        const learned = await call('learn', { contract: true, profile }, type);
        assert.equal(learned.applied, false);
        assert.equal(learned.rules[0].answers[0].text, 'Write to {{email}}.');
        assert.equal(learned.rules[0].answers[0].approved, false);
        const answer = await call(
          'plan',
          { question, profile: { email: 'next@example.test' } },
          type
        );
        assert.equal(answer.text, 'Write to next@example.test.');
      }
    } finally {
      await server.close();
    }
  }
);
