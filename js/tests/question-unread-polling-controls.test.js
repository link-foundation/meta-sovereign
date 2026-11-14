import test from 'node:test';
import assert from 'node:assert/strict';
import { questionBrowserApi } from '../src/web/question-browser-api.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  questionBrowserCli,
  questionBrowserHttp,
} from '../../experiments/issue-56/question-browser-clients.mjs';
import {
  unreadInput,
  unreadReviewFixture,
} from '../../experiments/issue-56/question-unread-review-fixture.mjs';
import {
  pollingSettings,
  waitUnreadPolling,
} from '../../experiments/issue-56/unread-polling-fixture.mjs';

test(
  'CLI owns configured polling until expiry and rejects malformed switches before starting',
  { timeout: 5000 },
  async () => {
    const env = await unreadReviewFixture();
    const call = questionBrowserCli(env);
    const input = unreadInput();
    try {
      for (const flag of [
        'poll-interval-ms',
        'poll-duration-ms',
        'poll-retry-max-ms',
        'poll-failures',
      ]) {
        assert.equal(
          (
            await call('unread', {
              source: 'hh',
              confirm: 'true',
              [flag]: true,
            })
          ).code,
          1
        );
      }
      assert.equal(env.state.scans.length, 0);
      const result = await call('unread', {
        source: 'hh',
        confirm: 'true',
        'pass-id': input.id,
        'poll-interval-ms': '1000',
        'poll-duration-ms': '1000',
        'poll-retry-max-ms': '2000',
        'poll-failures': '2',
      });
      assert.equal(result.code, 0);
      assert.equal(result.value.state, 'stopped');
      assert.equal(result.value.polling.reason, 'expired');
      assert.equal(result.value.polling.settings.maxFailures, 2);
      assert.equal(
        (await call('unread-status', { 'pass-id': input.id })).value.id,
        input.id
      );
      assert.equal(env.state.scans.length, 1);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'both Lino clients preserve parent/child receipts and recover read-only after a lost response',
  { timeout: 10000 },
  async () => {
    const env = await unreadReviewFixture();
    const { server, call } = await questionBrowserHttp(env);
    try {
      for (const media of [LINO_TEXT, LINO_BINARY]) {
        const input = unreadInput({ polling: pollingSettings });
        const requests = [];
        const api = questionBrowserApi({
          remote: {
            report: async (path, value, options) => {
              requests.push(options);
              const response = await call(path.split('/').at(-1), value, media);
              if (path.endsWith('unread-start')) {
                assert.equal(response.status, 200);
                throw new Error('response lost');
              }
              return response.body;
            },
          },
        });
        await assert.rejects(
          api.startBrowserUnreadReview(input),
          /response lost/
        );
        await waitUnreadPolling(
          env.browser,
          input.id,
          (value) => value.polling.passes === 1
        );
        const status = await api.browserUnreadReviewStatus(input);
        assert.equal(status.polling.receiptPassId, status.polling.lastPassId);
        assert.equal(status.entries.length, 1);
        assert.deepEqual(
          requests.map(({ read }) => read),
          [false, true]
        );
        const stopped = await api.stopBrowserUnreadReview(input);
        assert.equal(stopped.state, 'stopped');
        assert.equal(stopped.owned, false);
        const reread = await api.browserUnreadReviewStatus(input);
        assert.equal(reread.polling.lastPassId, stopped.polling.lastPassId);
      }
      assert.equal(env.state.scans.length, 2);
      assert.equal(env.state.sends.length, 0);
    } finally {
      await server.close();
      await env.browser.close();
    }
  }
);
