import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { postQuestion } from './helpers/question-http.mjs';
import { saveAnswerModel } from '../src/automation/answer-model-config.js';
import {
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  noticeText,
  noticeReply,
  noticeRule,
} from '../../experiments/issue-56/notice-fixture.mjs';

test('a proposed no-reply notice cannot become a model reply', async () => {
  const store = createMemoryStore();
  await saveAnswerModel(store, { enabled: true, revision: null });
  await saveAnswerRule(
    store,
    noticeRule({ answers: [{ text: '[без ответа]' }] })
  );
  const result = await previewAnswer(
    store,
    {
      question: noticeText,
      modelDraft: true,
    },
    { runner: () => assert.fail('no model request for a no-reply proposal') }
  );
  assert.equal(result.text, '');
  assert.equal(result.noReplyProposed, true);
  assert.equal(result.requiresReview, true);
  assert.notEqual(result.model?.used, true);
});

test(
  'CLI and offline notice rules preserve reviewed proposals and no-reply status',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const cli = createAutomationCommands({ openStore: async () => store });
    const lines = [];
    await cli.automations(
      {
        _: ['answers', 'save'],
        id: 'notice',
        kind: 'notice',
        question: noticeText,
        answer: noticeReply,
        approved: true,
        json: true,
      },
      (line) => lines.push(line)
    );
    assert.equal(JSON.parse(lines.at(-1)).rule.kind, 'notice');
    const api = questionApi({
      store,
      remote: { get: async () => null, report: async () => null },
    });
    const result = await api.previewAnswer({
      question: `Hello! ${noticeText}`,
    });
    assert.equal(result.text, noticeReply);
    assert.equal(result.requiresReview, true);
    await api.saveAnswerRule(
      noticeRule({
        id: 'notice',
        answers: [{ text: '[без ответа]', approved: true }],
      })
    );
    assert.equal(
      (await api.previewAnswer({ question: noticeText })).noReply,
      true
    );
    await api.deleteAnswerRule('notice');
    assert.deepEqual(await api.answerRules(), []);
  }
);

test(
  'both negotiated Lino routes preserve notice kind, validation and current policy',
  { timeout: 10000 },
  async () => {
    const { server, base } = await formReviewHttp(
      { store: createMemoryStore() },
      LINO_TEXT
    );
    const call = (action, body, media) =>
      postQuestion(base, action, body, media);
    try {
      for (const media of [LINO_TEXT, LINO_BINARY]) {
        const saved = await call('save', { rule: noticeRule() }, media);
        assert.equal(saved.status, 200);
        assert.equal(saved.body.rule.kind, 'notice');
        const result = await call('plan', { question: noticeText }, media);
        assert.equal(result.body.text, noticeReply);
        assert.equal(result.body.requiresReview, true);
        const invalid = await call(
          'save',
          { rule: noticeRule({ question: 'What is your name?' }) },
          media
        );
        assert.equal(invalid.status, 400);
        const after = await call('plan', { question: noticeText }, media);
        assert.equal(
          after.body.text,
          noticeReply,
          'failed save preserves the existing rule'
        );
      }
    } finally {
      await server.close();
    }
  }
);
