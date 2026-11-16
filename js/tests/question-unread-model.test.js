import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  withUnreadModel,
  modelUnreadRow,
  modelUnreadHistory,
} from '../../experiments/issue-56/unread-model-fixture.mjs';
import { modelText } from '../../experiments/issue-56/forms-model-fixture.mjs';
import { saveAnswerModel } from '../src/automation/answer-model-config.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { listOutbox } from '../src/automation/outbox.js';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import {
  pollingSettings,
  waitUnreadPolling,
} from '../../experiments/issue-56/unread-polling-fixture.mjs';

const review = async (env, result) => env.store.get(result.entries[0].reviewId);

test('unread model opt-in uses stored CV, profile, approved answers and the acknowledged chat history only', () =>
  withUnreadModel(async (env) => {
    const result = await env.complete(env.input);
    assert.equal(result.state, 'completed', JSON.stringify(result));
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].answer.phase, 'prefilled');
    assert.deepEqual(env.state.prefills, [{ chat: '8', text: modelText }]);
    assert.equal(env.calls.length, 1);
    const { context } = env.calls[0];
    assert.equal(context.cv.id, 'cv:model-fixture');
    assert.equal(context.profile.name, 'Ada Example');
    assert.equal(
      context.answers.some(({ id }) => id === 'qa-rule:model-nearby'),
      true
    );
    assert.deepEqual(context.recent, [
      {
        text: modelUnreadHistory(modelUnreadRow)[0].body,
        evidence: 'msg:hh:8:101',
      },
    ]);
    const saved = await review(env, result);
    assert.equal(saved.plan.model.used, true);
    assert.equal(saved.plan.requiresReview, true);
    assert.equal(saved.plan.source, 'model');
    assert.deepEqual(await listOutbox(env.store), []);
    assert.equal(env.state.sends.length, 0);
    assert.equal(
      (await env.store.get('qa-rule:model-nearby')).answers[0].count,
      1
    );
    assert.equal(result.restoration.heldReview.chat, '8');
  }));

test('missing personal facts become visible clarification drafts without sending', () =>
  withUnreadModel(
    async (env) => {
      const result = await env.complete(env.input);
      const saved = await review(env, result);
      assert.equal(saved.plan.complete, false);
      assert.match(env.state.prefills[0].text, /\[clarify: What starting date/);
      assert.equal(env.state.sends.length, 0);
    },
    {
      rows: [
        {
          ...modelUnreadRow,
          question: {
            ...modelUnreadRow.question,
            body: 'Starting date for this vacancy?',
          },
        },
      ],
    }
  ));

test('model drafts require both explicit unread answer mode and explicit model intent', () =>
  withUnreadModel(
    async (env) => {
      for (const polling of [undefined, pollingSettings]) {
        const input = {
          ...env.input,
          id: `question-unread:${randomUUID()}`,
          answerChats: false,
          polling,
        };
        await env.browser.unreadStart(input);
        await waitUnreadPolling(env.browser, input.id, (value) =>
          polling ? value.polling.phase === 'waiting' : value.state !== 'active'
        );
        await env.browser.unreadStop(input);
        assert.equal(env.calls.length, 0);
      }
      const result = await env.complete({ ...env.input, modelDraft: false });
      assert.equal(result.entries[0].answer.phase, 'review');
      assert.equal(env.calls.length, 0);
      assert.equal(env.state.prefills.length, 0);
    },
    { rows: [modelUnreadRow] }
  ));

test('offered bot options and owner drafts never call the configured model', async () => {
  for (const row of [
    {},
    { strictOptions: true, answerOptions: [] },
    { ...modelUnreadRow, hasDraft: true },
    { ...modelUnreadRow, noticeContext: { canReply: false } },
    {
      ...modelUnreadRow,
      question: { ...modelUnreadRow.question, outgoing: true },
    },
  ]) {
    await withUnreadModel(
      async (env) => {
        await env.complete(env.input);
        assert.equal(env.calls.length, 0);
        assert.equal(env.state.prefills.length, 0);
      },
      { rows: [row] }
    );
  }
});

test('disabled or invalid model output leaves a review without claiming a draft', async () => {
  for (const disabled of [true, false]) {
    await withUnreadModel(
      async (env) => {
        if (disabled) {
          await saveAnswerModel(env.store, {
            ...env.seed.settings,
            enabled: false,
          });
        }
        const result = await env.complete(env.input);
        assert.equal(result.entries[0].answer.phase, 'review');
        assert.equal(
          (await review(env, result)).plan.model.state,
          disabled ? 'disabled' : 'refused'
        );
        assert.equal(env.state.prefills.length, 0);
      },
      {
        runner: async () => ({
          drafts: [
            {
              id: 'question',
              text: 'Unsupported personal claim',
              missing: [],
              evidence: ['invented'],
            },
          ],
        }),
      }
    );
  }
});

test('an unavailable model holds an honest review and missing history timestamps supply no invented context', async () => {
  await withUnreadModel(
    async (env) => {
      const result = await env.complete(env.input);
      assert.equal((await review(env, result)).plan.model.state, 'unavailable');
      assert.equal(result.entries[0].answer.phase, 'review');
      assert.equal(env.state.prefills.length, 0);
    },
    { runner: undefined }
  );
  await withUnreadModel(
    async (env) => {
      const result = await env.complete(env.input);
      assert.equal(result.entries[0].answer.phase, 'prefilled');
      assert.deepEqual(env.calls[0].context.recent, []);
    },
    {
      history: (snapshot) =>
        modelUnreadHistory(snapshot).map(
          ({ timestamp: _timestamp, ...row }) => row
        ),
    }
  );
});

test('queued CV, profile, rule, policy, model settings or captured history changes refuse the issued draft', async () => {
  const mutations = [
    (env) =>
      env.store.put({
        id: 'cv:model-fixture',
        cv: { basics: { name: 'Changed' } },
      }),
    async (env) => {
      const profile = await env.store.get('qa-profile:model-fixture');
      await saveAnswerProfile(env.store, {
        ...profile,
        values: { name: 'Changed' },
      });
    },
    (env) =>
      saveAnswerRule(env.store, {
        id: 'new-rule',
        question: 'Unrelated question',
        answers: [{ text: 'Changed', approved: true }],
      }),
    (env) => saveAnswerPolicy(env.store, { rejected: [modelText] }),
    async (env) => {
      const settings = await env.store.get('config:answer-model');
      await saveAnswerModel(env.store, { ...settings, enabled: false });
    },
    (env, input, snapshot) =>
      input.onHistoryWindow({
        chat: snapshot.chat,
        rows: modelUnreadHistory(snapshot).map((row, index) =>
          index === 0
            ? { ...row, body: 'Owner corrected earlier experience.' }
            : row
        ),
      }),
  ];
  for (const queued of mutations) {
    await withUnreadModel(
      async (env) => {
        const result = await env.complete(env.input);
        assert.equal(result.state, 'failed', JSON.stringify(result));
        assert.equal(result.code, 'question-watch-plan-changed');
        assert.equal(env.calls.length, 1);
        assert.equal(env.state.prefills.length, 0);
        assert.equal(env.state.sends.length, 0);
      },
      { queued }
    );
  }
});

test(
  'Stop cancels and drains the in-flight model request before returning',
  { timeout: 5000 },
  async () => {
    let started;
    const entered = new Promise((resolve) => {
      started = resolve;
    });
    let drained = false;
    await withUnreadModel(
      async (env) => {
        await env.browser.unreadStart(env.input);
        await entered;
        const stopped = await env.browser.unreadStop({ id: env.input.id });
        assert.equal(drained, true);
        assert.equal(stopped.state, 'stopped');
        assert.equal(env.state.prefills.length, 0);
        assert.equal(env.state.sends.length, 0);
      },
      {
        runner: ({ signal }) =>
          new Promise((resolve, reject) => {
            const cancel = () => {
              drained = true;
              reject(signal.reason);
            };
            signal.addEventListener('abort', cancel, { once: true });
            started();
            if (signal.aborted) {
              cancel();
            }
          }),
      }
    );
  }
);

test('saved model review recovery never regenerates, edits or sends again', () =>
  withUnreadModel(async (env) => {
    const result = await env.complete(env.input);
    const reader = createQuestionBrowser(env);
    try {
      await reader.unreadStatus({ id: env.input.id });
      await reader.unreadStart(env.input);
      assert.equal(env.calls.length, 1);
      assert.equal(env.state.prefills.length, 1);
      assert.equal((await review(env, result)).plan.text, modelText);
    } finally {
      await reader.close();
    }
  }));

test(
  'owned polling forwards model intent and preserves its held review',
  { timeout: 5000 },
  () =>
    withUnreadModel(async (env) => {
      const input = { ...env.input, polling: pollingSettings };
      await env.browser.unreadStart(input);
      await waitUnreadPolling(
        env.browser,
        input.id,
        (value) => value.polling.phase === 'waiting'
      );
      const record = await env.store.get(input.id);
      assert.equal(record.input.modelDraft, true);
      assert.equal(record.input.heldChat, '8');
      assert.equal(env.calls.length, 1);
      await env.browser.unreadStop({ id: input.id });
    })
);

test(
  'CLI and both negotiated Lino transports preserve model opt-in and review-only results',
  { timeout: 10000 },
  async () => {
    const { questionBrowserCli, questionBrowserHttp } =
      await import('../../experiments/issue-56/question-browser-clients.mjs');
    const { LINO_TEXT, LINO_BINARY } = await import('../src/transport/lino.js');
    await withUnreadModel(async (env) => {
      const result = await questionBrowserCli(env)('unread', {
        source: 'hh',
        confirm: true,
        'pass-id': env.input.id,
        'answer-chats': true,
        'model-draft': true,
        approximate: false,
        'profile-id': env.seed.profile.id,
      });
      assert.equal(result.code, 0, JSON.stringify(result));
      assert.equal(result.value.entries[0].answer.phase, 'prefilled');
      assert.equal(env.calls.length, 1);
    });
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      await withUnreadModel(async (env) => {
        const http = await questionBrowserHttp(env);
        try {
          const started = await http.call('unread-start', env.input, media);
          assert.equal(started.status, 200);
          await waitUnreadPolling(
            {
              unreadStatus: async (input) =>
                (await http.call('unread-status', input, media)).body,
            },
            env.input.id,
            (value) => value.state !== 'active'
          );
          const result = await http.call(
            'unread-status',
            { id: env.input.id },
            media
          );
          assert.equal(result.body.entries[0].answer.phase, 'prefilled');
          assert.deepEqual(env.state.prefills, [
            { chat: '8', text: modelText },
          ]);
          assert.deepEqual(await listOutbox(env.store), []);
        } finally {
          await http.server.close();
        }
      });
    }
  }
);
