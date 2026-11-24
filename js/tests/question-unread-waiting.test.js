import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { questionUnreadCommand } from '../src/cli/question-unread-commands.js';
import { unreadSkipTarget } from '../src/automation/question-unread-polling-state.js';
import { normalizeUnreadScanOptions } from '../src/sources/browser-unread-conversations.js';
import {
  unreadInput,
  unreadReviewFixture,
} from '../../experiments/issue-56/question-unread-review-fixture.mjs';
import {
  waitUnreadPolling,
  pollingSettings,
} from '../../experiments/issue-56/unread-polling-fixture.mjs';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import { browserQuestion } from '../../experiments/issue-56/question-browser-fixture.mjs';
import { questionBrowserHttp } from '../../experiments/issue-56/question-browser-clients.mjs';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';

const waiting = {
  answerChats: true,
  reviewChoices: true,
  watchWaiting: true,
};

const emptyPass = (scope) => ({
  conversations: [],
  coverage: {
    complete: false,
    scope,
    reason: 'observed-list',
    observed: 0,
    visited: 0,
  },
  restoration: { restored: true, reason: 'checked' },
});

const withWatch = async (work) => {
  const env = await unreadReviewFixture(async ({ watchWaiting }) =>
    emptyPass(watchWaiting ? 'waiting-conversations' : 'unread-conversations')
  );
  env.send.unreadAnswerReplySources = () => [{ id: 'hh', name: 'HeadHunter' }];
  try {
    await work(env);
  } finally {
    await env.browser.close();
  }
};

test('waiting chat scans have a distinct explicit mode and keep arbitrary all-chat scans refused', () => {
  assert.equal(
    normalizeUnreadScanOptions({ watchWaiting: true }).watchWaiting,
    true
  );
  assert.throws(() => normalizeUnreadScanOptions({ watchWaiting: 'true' }), {
    code: 'bad-chat-scan',
  });
  assert.throws(() => normalizeUnreadScanOptions({ unreadOnly: false }), {
    code: 'bad-chat-scan',
  });
});

test('a supervised HeadHunter watch calls the native waiting scan and recovers its coverage', async () =>
  withWatch(async ({ browser, state }) => {
    const input = unreadInput({ ...waiting, polling: pollingSettings });
    const started = await browser.unreadStart(input);
    assert.equal(started.watchWaiting, true);
    const result = await waitUnreadPolling(
      browser,
      input.id,
      (value) => value.polling.phase === 'waiting'
    );
    assert.equal(state.scans[0].watchWaiting, true);
    assert.equal(result.coverage.scope, 'waiting-conversations');
    assert.equal((await browser.unreadStop(input)).state, 'stopped');
  }));

test('waiting review requires explicit repeated owner-only handling', async () =>
  withWatch(async ({ browser, state }) => {
    for (const options of [
      waiting,
      { ...waiting, polling: pollingSettings, answerChats: false },
      { ...waiting, polling: pollingSettings, reviewChoices: false },
    ]) {
      await assert.rejects(browser.unreadStart(unreadInput(options)), {
        code: 'question-unread-waiting-unavailable',
      });
    }
    assert.equal(state.scans.length, 0);
  }));

const heldWatch = async (browser, id) =>
  waitUnreadPolling(
    browser,
    id,
    (status) => unreadSkipTarget(status) && status.polling.nextAt
  );

for (const media of [LINO_TEXT, LINO_BINARY]) {
  test(
    `trusted ${media} clients can skip the exact held question and recover its receipt`,
    { timeout: 12000 },
    async () => {
      const env = await unreadAnswerFixture({ rows: [{}] });
      const { server, call } = await questionBrowserHttp(env);
      try {
        const input = unreadInput({ ...waiting, polling: pollingSettings });
        assert.equal((await call('unread-start', input, media)).status, 200);
        const client = {
          async unreadStatus(request) {
            const { status, body } = await call(
              'unread-status',
              request,
              media
            );
            assert.equal(status, 200);
            return body;
          },
        };
        const target = unreadSkipTarget(await heldWatch(client, input.id));
        assert.equal(
          (
            await call('unread-skip', target, media, {
              origin: 'https://untrusted.test',
            })
          ).status,
          403
        );
        const result = await call('unread-skip', target, media);
        assert.equal(result.status, 200);
        assert.equal(
          result.body.polling.lastSkip.questionId,
          target.questionId
        );
        assert.equal(
          (await call('unread-status', { id: input.id }, media)).body.polling
            .lastSkip.passId,
          target.passId
        );
        assert.equal(env.state.sends.length, 0);
      } finally {
        await server.close();
        await env.browser.close();
      }
    }
  );
}

test('Skip wakes the current exact held visit, recovers idempotently and never sends', async () => {
  const row = { question: { ...browserQuestion().question } };
  const { browser, state } = await unreadAnswerFixture({ rows: [row, {}] });
  const input = unreadInput({ ...waiting, polling: pollingSettings });
  try {
    await browser.unreadStart(input);
    const first = unreadSkipTarget(await heldWatch(browser, input.id));
    for (const changed of [
      { chat: '9' },
      { questionId: '102' },
      { passId: input.id },
    ]) {
      await assert.rejects(browser.unreadSkip({ ...first, ...changed }), {
        code: 'question-unread-skip-changed',
      });
    }
    const refusedAt = state.scans.length;
    assert.equal(refusedAt, 1);
    const skipped = await browser.unreadSkip(first);
    const { id: _id, ...receipt } = first;
    assert.deepEqual(skipped.polling.lastSkip, receipt);
    assert.equal(skipped.entries[0].answer.phase, 'skipped');
    assert.equal(skipped.restoration.restored, true);
    assert.deepEqual(
      (await browser.unreadSkip(first)).polling.lastSkip,
      receipt
    );
    const second = unreadSkipTarget(await heldWatch(browser, input.id));
    assert.equal(second.chat, '9');
    assert.equal(state.sends.length, 0);
  } finally {
    await browser.close();
  }
});

test('Skip refuses a newer incoming question even when its text is unchanged', async () => {
  const row = { question: { ...browserQuestion().question } };
  const { browser, state } = await unreadAnswerFixture({ rows: [row, {}] });
  const input = unreadInput({ ...waiting, polling: pollingSettings });
  try {
    await browser.unreadStart(input);
    const first = unreadSkipTarget(await heldWatch(browser, input.id));
    row.question.id = '102';
    await assert.rejects(browser.unreadSkip(first), {
      code: 'question-unread-skip-changed',
    });
    const status = await heldWatch(browser, input.id);
    assert.equal(status.polling.lastSkip, undefined);
    assert.equal(unreadSkipTarget(status).questionId, '102');
    assert.equal(state.sends.length, 0);
  } finally {
    await browser.close();
  }
});

test('the supervised foreground command binds s to the currently held question', async () => {
  const stdin = new PassThrough();
  const id = unreadInput().id;
  const passId = unreadInput().id;
  const calls = [];
  const notices = [];
  const current = {
    id,
    owned: true,
    state: 'active',
    watchWaiting: true,
    restoration: {
      heldReview: { chat: '8', questionId: '101', currentQuestionId: '101' },
    },
    polling: { phase: 'waiting', lastPassId: passId, receiptPassId: passId },
  };
  const browser = {
    async unreadStart(input) {
      assert.equal(input.watchWaiting, true);
      assert.equal(input.answerChats, true);
      assert.equal(input.reviewChoices, true);
      assert.deepEqual(input.polling, {});
      return current;
    },
    async unreadStatus() {
      return { ...current, state: calls.length ? 'stopped' : 'active' };
    },
    async unreadSkip(input) {
      calls.push(input);
      const { id: _id, ...lastSkip } = input;
      return { ...current, polling: { ...current.polling, lastSkip } };
    },
    async unreadStop() {},
  };
  await questionUnreadCommand(
    { source: 'hh', confirm: true, 'pass-id': id, 'watch-waiting': true },
    browser,
    {},
    () => {},
    {
      stdin,
      notice(message) {
        notices.push(message);
        if (message.endsWith('Enter s to skip.')) {
          stdin.write('s\ns\n');
        }
      },
    }
  );
  stdin.end();
  assert.deepEqual(calls, [{ id, passId, chat: '8', questionId: '101' }]);
  assert.match(notices.at(-1), /^Skipped chat 8\.$/u);
});
