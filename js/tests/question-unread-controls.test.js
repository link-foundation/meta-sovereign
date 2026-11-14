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
  unreadPass,
  unreadReviewFixture,
  waitUnreadReview,
} from '../../experiments/issue-56/question-unread-review-fixture.mjs';

test(
  'CLI owns one finite unread pass and recovers its result without another browser read',
  { timeout: 5000 },
  async () => {
    const env = await unreadReviewFixture();
    const call = questionBrowserCli(env);
    const input = unreadInput();
    try {
      assert.equal(
        (await call('unread', { source: 'hh', 'pass-id': input.id })).code,
        1
      );
      assert.equal(env.state.scans.length, 0);
      const result = await call('unread', {
        source: 'hh',
        'pass-id': input.id,
        confirm: 'true',
        'max-chats': '2',
      });
      assert.equal(result.code, 0);
      assert.equal(result.value.state, 'completed');
      assert.equal(result.value.entries.length, 1);
      assert.equal(
        (await call('unread-status', { 'pass-id': input.id })).value.state,
        'completed'
      );
      assert.equal(env.state.scans.length, 1);
      assert.equal(env.state.sends.length, 0);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'both Lino transports preserve finite review IDs, partial coverage, origin and confirmation checks',
  { timeout: 15000 },
  async () => {
    const env = await unreadReviewFixture();
    const { server, call } = await questionBrowserHttp(env);
    try {
      for (const media of [LINO_TEXT, LINO_BINARY]) {
        const input = unreadInput();
        assert.equal(
          (
            await call('unread-start', input, media, {
              origin: 'https://untrusted.test',
            })
          ).status,
          403
        );
        assert.equal(
          (await call('unread-start', { ...input, confirm: false }, media)).body
            .code,
          'confirm-required'
        );
        const started = await call('unread-start', input, media);
        assert.equal(started.status, 200);
        assert.equal(started.body.id, input.id);
        // The same production service owns the pass; wait only for its finite mock.
        for (let i = 0; i < 100; i++) {
          const result = (await call('unread-status', { id: input.id }, media))
            .body;
          if (result.state !== 'active') {
            assert.equal(result.state, 'completed');
            assert.equal(result.coverage.complete, false);
            assert.equal(result.restoration.restored, true);
            assert.equal(result.entries.length, 1);
            break;
          }
          if (i === 99) {
            assert.fail('finite unread transport did not settle');
          }
        }
        assert.equal(
          (await call('unread-stop', { id: input.id }, media)).body.state,
          'completed'
        );
      }
      assert.equal(env.state.scans.length, 2);
      assert.equal(env.state.sends.length, 0);
    } finally {
      await server.close();
      await env.browser.close();
    }
  }
);

test('lost start response recovers by the same ID with a read-only single call and no replay', async () => {
  const env = await unreadReviewFixture();
  const input = unreadInput();
  const calls = [];
  const api = questionBrowserApi({
    remote: {
      report: async (path, value, options) => {
        calls.push([path, options]);
        if (path.endsWith('unread-start')) {
          await env.browser.unreadStart(value);
          throw new Error('response lost after admission');
        }
        return env.browser.unreadStatus(value);
      },
    },
  });
  try {
    await assert.rejects(api.startBrowserUnreadReview(input), /response lost/);
    await waitUnreadReview(env.browser, input.id);
    assert.equal(
      (await api.browserUnreadReviewStatus(input)).state,
      'completed'
    );
    assert.deepEqual(
      calls.map((call) => call[1]),
      [
        { network: true, read: false },
        { network: true, read: true },
      ]
    );
    assert.equal(env.state.scans.length, 1);
  } finally {
    await env.browser.close();
  }
});

test('unconfirmed or changed batch responses cannot fabricate completed unread review', async () => {
  const env = await unreadReviewFixture(async () => unreadPass());
  const input = unreadInput();
  try {
    await env.browser.unreadStart(input);
    const result = await waitUnreadReview(env.browser, input.id);
    for (const value of [
      null,
      { ...result, id: unreadInput().id },
      { ...result, coverage: { ...result.coverage, complete: true } },
      { ...result, restoration: null },
      {
        ...result,
        restoration: {
          restored: true,
          reason: 'checked',
          history: {
            positionRestored: false,
            reusedOwnedForward: false,
            lengthBefore: 2,
            lengthAfter: 3,
          },
        },
      },
      {
        ...result,
        restoration: {
          restored: true,
          reason: 'checked',
          history: {
            positionRestored: true,
            reusedOwnedForward: false,
            lengthBefore: -1,
            lengthAfter: 3,
          },
        },
      },
      { ...result, entries: [{ chat: '8', reviewId: 'invented' }] },
    ]) {
      const api = questionBrowserApi({ remote: { report: async () => value } });
      await assert.rejects(api.browserUnreadReviewStatus(input));
    }
  } finally {
    await env.browser.close();
  }
});
