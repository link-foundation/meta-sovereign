import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { listAnswerRules } from '../src/automation/question-store.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { postQuestion } from './helpers/question-http.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { archivedNoticeTurns } from '../../experiments/issue-56/notice-learning-fixture.mjs';
import {
  noticeText,
  noticeReply,
} from '../../experiments/issue-56/notice-fixture.mjs';

const archive = async () => {
  const store = createMemoryStore();
  for (const message of archivedNoticeTurns()) {
    await store.put(message);
  }
  return store;
};

test(
  'CLI notice learning preview and offline apply share unapproved actual counts',
  { timeout: 5000 },
  async () => {
    const store = await archive();
    const commands = createAutomationCommands({ openStore: async () => store });
    const output = [];
    await commands.automations(
      { _: ['answers', 'learn'], json: true },
      (line) => output.push(line)
    );
    const preview = JSON.parse(output.at(-1));
    assert.equal(preview.rules[0].kind, 'notice');
    assert.equal(preview.rules[0].answers[0].count, 2);
    assert.deepEqual(await listAnswerRules(store), []);
    const offline = questionApi({
      store,
      remote: { get: async () => null, report: async () => null },
    });
    const saved = await offline.learnAnswers({ apply: true });
    assert.equal(saved.rules[0].answers[0].approved, false);
    const planned = await offline.previewAnswer({ question: noticeText });
    assert.equal(planned.text, noticeReply);
    assert.equal(planned.requiresReview, true);
    assert.equal(planned.notice, true);
    const again = await offline.learnAnswers({ apply: true });
    assert.equal(again.rules[0].answers[0].count, 2);
  }
);

test(
  'both Lino learning routes preserve notice kind, read-only previews and replay-safe approval',
  { timeout: 10000 },
  async () => {
    const store = await archive();
    const { server, base } = await formReviewHttp({ store }, LINO_TEXT);
    const call = (body, media) => postQuestion(base, 'learn', body, media);
    try {
      for (const media of [LINO_TEXT, LINO_BINARY]) {
        const preview = await call({}, media);
        assert.equal(preview.status, 200);
        assert.equal(preview.body.rules[0].kind, 'notice');
        assert.equal(preview.body.rules[0].answers[0].count, 2);
        assert.equal(preview.body.applied, false);
        const applied = await call({ apply: true }, media);
        assert.equal(applied.body.applied, true);
        assert.equal(applied.body.rules[0].answers[0].approved, false);
        assert.equal(applied.body.coverage.retained, 4);
        const invalid = await call({ self: 'owner' }, media);
        assert.equal(invalid.status, 400);
        assert.equal((await listAnswerRules(store))[0].answers[0].count, 2);
      }
    } finally {
      await server.close();
    }
  }
);
