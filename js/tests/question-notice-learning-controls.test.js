import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { listAnswerRules } from '../src/automation/question-store.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { postQuestion } from './helpers/question-http.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  archivedNoticeTurns,
  noticeTurn,
  noticePatternVariant,
  noticePatternUnseen,
} from '../../experiments/issue-56/notice-learning-fixture.mjs';
import {
  noticeText,
  noticeReply,
} from '../../experiments/issue-56/notice-fixture.mjs';

const archive = async (patterns) => {
  const store = createMemoryStore();
  for (const message of archivedNoticeTurns()) {
    await store.put(message);
  }
  if (patterns) {
    for (const message of noticeTurn({
      chat: 'variant',
      question: noticePatternVariant,
    })) {
      await store.put(message);
    }
  }
  return store;
};
const original = (rules) => rules.find((rule) => rule.question === noticeText);
const verifyPattern = (rules, patterns) =>
  assert.equal(Boolean(original(rules).learnedPatterns?.length), patterns);

for (const patterns of [false, true]) {
  test(
    `CLI notice learning preview and offline apply share actual counts (patterns=${patterns})`,
    { timeout: 5000 },
    async () => {
      const store = await archive(patterns);
      const commands = createAutomationCommands({
        openStore: async () => store,
      });
      const output = [];
      await commands.automations(
        { _: ['answers', 'learn'], json: true },
        (line) => output.push(line)
      );
      const preview = JSON.parse(output.at(-1));
      assert.equal(original(preview.rules).kind, 'notice');
      assert.equal(original(preview.rules).answers[0].count, 2);
      verifyPattern(preview.rules, patterns);
      assert.deepEqual(await listAnswerRules(store), []);
      const offline = questionApi({
        store,
        remote: { get: async () => null, report: async () => null },
      });
      const saved = await offline.learnAnswers({ apply: true });
      assert.equal(original(saved.rules).answers[0].approved, false);
      const planned = await offline.previewAnswer({
        question: patterns ? noticePatternUnseen : noticeText,
        approximate: false,
      });
      assert.equal(planned.text, noticeReply);
      assert.equal(planned.requiresReview, true);
      assert.equal(planned.notice, true);
      assert.equal(Boolean(planned.learnedPattern), patterns);
      const again = await offline.learnAnswers({ apply: true });
      assert.equal(original(again.rules).answers[0].count, 2);
    }
  );

  test(
    `both Lino learning routes preserve notice review and observations (patterns=${patterns})`,
    { timeout: 10000 },
    async () => {
      const store = await archive(patterns);
      const { server, base } = await formReviewHttp({ store }, LINO_TEXT);
      const call = (body, media) => postQuestion(base, 'learn', body, media);
      try {
        for (const media of [LINO_TEXT, LINO_BINARY]) {
          const preview = await call({}, media);
          assert.equal(preview.status, 200);
          assert.equal(original(preview.body.rules).kind, 'notice');
          assert.equal(original(preview.body.rules).answers[0].count, 2);
          verifyPattern(preview.body.rules, patterns);
          assert.equal(preview.body.applied, false);
          const applied = await call({ apply: true }, media);
          assert.equal(applied.body.applied, true);
          assert.equal(original(applied.body.rules).answers[0].approved, false);
          assert.equal(applied.body.coverage.retained, patterns ? 6 : 4);
          const planned = await postQuestion(
            base,
            'plan',
            {
              question: patterns ? noticePatternUnseen : noticeText,
              approximate: false,
            },
            media
          );
          assert.equal(planned.body.text, noticeReply);
          assert.equal(planned.body.requiresReview, true);
          assert.equal(Boolean(planned.body.learnedPattern), patterns);
          const invalid = await call({ self: 'owner' }, media);
          assert.equal(invalid.status, 400);
          assert.equal(
            original(await listAnswerRules(store)).answers[0].count,
            2
          );
        }
      } finally {
        await server.close();
      }
    }
  );
}
