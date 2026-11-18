import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { questionBrowserApi } from '../src/web/question-browser-api.js';
import { questionWatchCommand } from '../src/cli/question-watch-commands.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { readAnswerPolicy } from '../src/automation/question-policy.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  decodeWire,
} from '../src/transport/lino.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { postQuestion } from './helpers/question-http.mjs';
import { noticePolicyFixture } from '../../experiments/issue-56/notice-policy-fixture.mjs';

const notices = {
  acknowledgements: 'reply',
  rejections: 'ignore',
  invitations: 'review',
  rejectionReply: 'May I ask the reason?',
};

test(
  'CLI Lino policy files and offline API share separate decisions without starting automation',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const cli = createAutomationCommands({ openStore: async () => store });
    const dir = await mkdtemp(join(tmpdir(), 'ms-notice-policy-'));
    const file = join(dir, 'policy.lino');
    try {
      await writeFile(file, encodeWire({ notices }, LINO_TEXT));
      const output = [];
      assert.equal(
        await cli.automations({ _: ['answers', 'policy', file] }, (line) =>
          output.push(line)
        ),
        0
      );
      assert.deepEqual(decodeWire(output.at(-1)).policy.notices, notices);
      const api = questionApi({
        store,
        remote: { get: async () => null, report: async () => null },
      });
      assert.deepEqual((await api.answerPolicy()).notices, notices);
      await api.saveAnswerPolicy({
        notices: { ...notices, rejections: 'reply' },
      });
      assert.equal((await readAnswerPolicy(store)).notices.rejections, 'reply');
      assert.deepEqual(
        await store.query((row) => row.kind === 'question-browser-watch'),
        []
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'both negotiated Lino policy routes preserve separate modes and refuse unsupported invitation automation',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const { server, base } = await formReviewHttp({ store }, LINO_TEXT);
    try {
      for (const media of [LINO_TEXT, LINO_BINARY]) {
        const saved = await postQuestion(
          base,
          'policy',
          { policy: { notices } },
          media
        );
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.body.policy.notices, notices);
        const invalid = await postQuestion(
          base,
          'policy',
          { policy: { notices: { invitations: 'reply' } } },
          media
        );
        assert.equal(invalid.status, 400);
        assert.deepEqual((await readAnswerPolicy(store)).notices, notices);
      }
      assert.deepEqual(
        await store.query((row) => row.kind === 'question-browser-watch'),
        []
      );
    } finally {
      await server.close();
    }
  }
);

test('CLI notice mode is explicit and shutdown removes its signal handlers', async () => {
  const env = await noticePolicyFixture();
  const before = ['SIGINT', 'SIGTERM'].map((signal) =>
    process.listenerCount(signal)
  );
  try {
    await assert.rejects(
      questionWatchCommand({ 'notice-replies': 'automatic' }, env.browser),
      /true or false/u
    );
    const status = await questionWatchCommand(
      {
        id: env.review.id,
        confirm: true,
        'watch-id': env.input.id,
        'notice-replies': 'true',
      },
      env.browser,
      () => process.emit('SIGINT')
    );
    assert.equal(status.noticeReplies, true);
    assert.equal(status.state, 'stopped');
    assert.deepEqual(env.state.sends, []);
    assert.deepEqual(
      ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)),
      before
    );
  } finally {
    await env.browser.close();
  }
});

test('browser client preserves inactive notice capability and refuses malformed mode or missing text receipt', async () => {
  const env = await noticePolicyFixture({
    notices: { acknowledgements: 'reply' },
  });
  let result;
  const api = questionBrowserApi({
    remote: {
      get: async () => env.browser.capabilities(),
      report: async () => result,
    },
  });
  try {
    assert.equal(
      (await api.browserAnswerCapabilities()).noticeSources[0].id,
      'hh'
    );
    await env.browser.watchStart(env.input);
    result = await env.until((s) => s.phase === 'sent');
    assert.equal(
      (await api.browserAnswerWatchStatus(env.input)).selection.type,
      'text'
    );
    const sent = result;
    result = { ...sent, noticeReplies: 'true' };
    await assert.rejects(api.browserAnswerWatchStatus(env.input));
    result = { ...sent, outbox: { ...sent.outbox, receipt: undefined } };
    await assert.rejects(api.browserAnswerWatchStatus(env.input), {
      code: 'question-browser-receipt-missing',
    });
  } finally {
    await env.browser.close();
  }
});

test('a backend that drops notice policies cannot produce a saved confirmation', async () => {
  const store = createMemoryStore();
  const api = questionApi({
    store,
    remote: {
      report: async () => ({
        policy: { rejected: [], punctuationEquivalent: false },
      }),
    },
  });
  await assert.rejects(api.saveAnswerPolicy({ notices }), /not confirmed/u);
  assert.equal(
    (await readAnswerPolicy(store)).notices.acknowledgements,
    'review'
  );
});
