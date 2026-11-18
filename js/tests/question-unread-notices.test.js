import test from 'node:test';
import assert from 'node:assert/strict';
import { unreadNoticeFixture } from '../../experiments/issue-56/unread-notice-fixture.mjs';
import { unreadInput } from '../../experiments/issue-56/question-unread-review-fixture.mjs';
import {
  noticeReply,
  noticeText,
} from '../../experiments/issue-56/notice-fixture.mjs';
import { rejectionText } from '../../experiments/issue-56/notice-policy-fixture.mjs';
import { listOutbox } from '../src/automation/outbox.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import { questionWatchGate } from '../../experiments/issue-56/question-watch-fixture.mjs';

const enabled = {
  acknowledgements: 'reply',
  rejections: 'reply',
  rejectionReply: 'May I ask why?',
};
const check = async (options, work) => {
  const env = await unreadNoticeFixture(options);
  try {
    await work(env);
  } finally {
    await env.browser.close();
  }
};

test('unread notice delivery requires explicit supported boolean admission before traversal', () =>
  check({}, async (env) => {
    for (const noticeReplies of ['true', 1, null]) {
      await assert.rejects(
        env.browser.unreadStart(unreadInput({ noticeReplies }))
      );
    }
    env.send.unreadNoticeReplySources = () => [];
    await assert.rejects(env.browser.unreadStart(env.input), {
      code: 'question-unread-notices-unavailable',
    });
    assert.equal(env.state.scans.length, 0);
    assert.equal((await env.complete(unreadInput())).noticeReplies, undefined);
    assert.equal(env.state.scans[0].onConversation, undefined);
    assert.deepEqual(env.state.sends, []);
  }));

test('default policies leave borrowed notices in review without models or provider sends', () =>
  check({}, async (env) => {
    const result = await env.complete();
    assert.equal(result.state, 'completed');
    assert.equal(result.noticeReplies, true);
    assert.equal(result.entries[0].notice.phase, 'review');
    assert.equal(
      (await env.store.get(result.entries[0].reviewId)).planning.modelDraft,
      false
    );
    assert.deepEqual(env.state.sends, []);
    assert.deepEqual(await listOutbox(env.store), []);
  }));

test('sequential acknowledgements and rejections persist shared reservations before issue', () =>
  check(
    {
      notices: enabled,
      bodies: [noticeText, rejectionText],
      issue: async ({ chat, text }, env) => {
        const pass = await env.store.get(env.input.id);
        assert.equal(pass.entries.at(-1).notice.phase, 'selecting');
        const sending = (await listOutbox(env.store)).filter(
          (entry) => entry.status === 'sending'
        );
        assert.equal(sending.length, chat === '8' ? 1 : 2);
        return {
          via: 'browser',
          source: 'hh',
          chat,
          text,
          messageId: `${chat}08`,
        };
      },
    },
    async (env) => {
      const result = await env.complete();
      assert.equal(result.state, 'completed');
      assert.deepEqual(
        result.entries.map((entry) => entry.notice.phase),
        ['sent', 'sent']
      );
      assert.deepEqual(env.state.sends, [
        { chat: '8', text: noticeReply },
        { chat: '9', text: enabled.rejectionReply },
      ]);
      assert.equal((await listOutbox(env.store)).length, 3);
      for (const entry of result.entries) {
        assert.equal(
          entry.notice.outbox.receipt.text,
          entry.notice.selection.text
        );
      }
      assert.equal(result.restoration.restored, true);
    }
  ));

test('incomplete history, owner drafts, invitations and changed turns cannot authorize replies', async () => {
  for (const options of [
    { complete: false },
    { restored: false },
    { snapshot: { hasDraft: true } },
    { bodies: ['We invite you to an interview.'] },
    { bodies: ['What time can you start?'] },
  ]) {
    await check({ ...options, notices: enabled }, async (env) => {
      await env.complete();
      assert.deepEqual(env.state.sends, []);
      assert.deepEqual(await listOutbox(env.store), []);
    });
  }
});

test('unknown delivery pauses the finite pass, retains uncertainty and never replays on recovery or restart', () =>
  check(
    {
      notices: enabled,
      bodies: [rejectionText, noticeText],
      issue: async () => ({ via: 'browser' }),
    },
    async (env) => {
      const result = await env.complete();
      assert.equal(result.state, 'paused');
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].notice.phase, 'unknown');
      assert.equal(
        (await listOutbox(env.store)).every((row) => row.status === 'unknown'),
        true
      );
      const restarted = createQuestionBrowser(env);
      try {
        assert.equal(
          (await restarted.unreadStart(env.input)).entries[0].notice.phase,
          'unknown'
        );
        assert.equal(env.state.scans.length, 1);
        assert.equal(env.state.sends.length, 1);
      } finally {
        await restarted.close();
      }
    }
  ));

test('later owner activity cannot erase a confirmed receipt or claim restoration', () =>
  check(
    {
      notices: enabled,
      afterVisit: () => {
        throw Object.assign(new Error('owner returned'), {
          code: 'browser-owner-active',
          restoration: { restored: false, reason: 'owner-active' },
        });
      },
    },
    async (env) => {
      const result = await env.complete();
      assert.equal(result.state, 'failed');
      assert.equal(result.coverage, null);
      assert.equal(result.restoration.restored, false);
      assert.equal(result.entries[0].notice.outbox.receipt.text, noticeReply);
      assert.equal(result.entries[0].notice.phase, 'sent');
    }
  ));

test('policy changes while queued refuse the borrowed send and leave a durable refusal', () =>
  check(
    {
      notices: enabled,
      queued: (env) =>
        saveAnswerPolicy(env.store, {
          notices: { acknowledgements: 'review' },
        }),
    },
    async (env) => {
      const result = await env.complete();
      assert.equal(result.state, 'paused');
      assert.equal(result.entries[0].notice.phase, 'failed');
      assert.deepEqual(env.state.sends, []);
    }
  ));

test('lost post-send pass persistence recovers the actual outbox receipt read-only', () =>
  check({ notices: enabled }, async (env) => {
    const put = env.store.put.bind(env.store);
    env.store.put = async (record) => {
      if (
        record.id === env.input.id &&
        record.entries[0]?.notice.phase === 'sent'
      ) {
        throw new Error('synthetic pass update loss');
      }
      return put(record);
    };
    const result = await env.complete();
    assert.equal(result.entries[0].notice.phase, 'sent');
    assert.equal(result.entries[0].notice.outbox.receipt.messageId, '808');
    assert.equal(env.state.sends.length, 1);
  }));

test(
  'Stop drains an issued reply and preserves its positive outcome without another send',
  { timeout: 5000 },
  async () => {
    const entered = questionWatchGate();
    const release = questionWatchGate();
    await check(
      {
        notices: enabled,
        bodies: [noticeText, rejectionText],
        issue: async ({ chat, text }) => {
          entered.release();
          await release.promise;
          return { via: 'browser', source: 'hh', chat, text, messageId: '808' };
        },
      },
      async (env) => {
        try {
          await env.browser.unreadStart(env.input);
          await entered.promise;
          let settled = false;
          const stop = env.browser.unreadStop(env.input).then((value) => {
            settled = true;
            return value;
          });
          await Promise.resolve();
          assert.equal(settled, false);
          release.release();
          const result = await stop;
          assert.equal(result.state, 'stopped');
          assert.equal(result.entries[0].notice.phase, 'sent');
          assert.equal(env.state.sends.length, 1);
        } finally {
          release.release();
        }
      }
    );
  }
);

test('a rejection already answered through another pass retains the original text and receipt', () =>
  check({ notices: enabled, bodies: [rejectionText] }, async (env) => {
    await env.complete();
    await saveAnswerPolicy(env.store, {
      notices: { rejections: 'reply', rejectionReply: 'A different reply.' },
    });
    const result = await env.complete(unreadInput({ noticeReplies: true }));
    assert.equal(result.entries[0].notice.phase, 'sent');
    assert.equal(
      result.entries[0].notice.selection.text,
      enabled.rejectionReply
    );
    assert.equal(env.state.sends.length, 1);
  }));

test('a failed reservation flush refuses notice delivery before issue', () =>
  check({ notices: enabled }, async (env) => {
    env.store.flush = async () => {
      if (
        (await listOutbox(env.store)).some((row) => row.status === 'sending')
      ) {
        throw new Error('synthetic reservation flush failure');
      }
    };
    const result = await env.complete();
    assert.equal(result.state, 'failed');
    assert.equal(result.entries[0].notice.phase, 'unknown');
    assert.deepEqual(env.state.sends, []);
  }));
