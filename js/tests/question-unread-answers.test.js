import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import {
  unreadInput,
  waitUnreadReview,
} from '../../experiments/issue-56/question-unread-review-fixture.mjs';
import { checkUnreadReview } from '../src/automation/question-unread-state.js';
import { listOutbox } from '../src/automation/outbox.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { saveSettings } from '../src/automation/safety.js';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import { pollingCycleFixture } from '../../experiments/issue-56/unread-polling-fixture.mjs';
import { unreadAnswerClientReceipt } from '../../experiments/issue-56/question-browser-clients.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  noticeRows,
  noticeSnapshot,
  rejectionText,
} from '../../experiments/issue-56/notice-policy-fixture.mjs';

const check = async (options, work) => {
  const env = await unreadAnswerFixture(options);
  try {
    await work(env);
  } finally {
    await env.browser.close();
  }
};

test('sequential answer admission requires explicit supported boolean intent', () =>
  check({}, async (env) => {
    for (const answerChats of ['true', 1, null]) {
      await assert.rejects(
        env.browser.unreadStart(unreadInput({ answerChats }))
      );
    }
    await assert.rejects(
      env.browser.unreadStart({ ...env.input, noticeReplies: true })
    );
    for (const modes of [
      { reviewChoices: 'true' },
      { answerChats: false, reviewChoices: true },
      { autoReuseAnswers: 'true' },
      { answerChats: false, autoReuseAnswers: true },
      { rejectionsFirst: 'true' },
      { answerChats: false, rejectionsFirst: true },
    ]) {
      await assert.rejects(
        env.browser.unreadStart({ ...env.input, ...modes }),
        {
          code: 'question-unread-answers-unavailable',
        }
      );
    }
    env.send.unreadAnswerReplySources = () => [];
    await assert.rejects(env.browser.unreadStart(env.input), {
      code: 'question-unread-answers-unavailable',
    });
    assert.equal(env.state.scans.length, 0);
  }));

test('approved bot choices continue sequentially and the first ordinary draft holds review', () =>
  check({}, async (env) => {
    const result = await env.complete();
    checkUnreadReview(result, env.input.id);
    assert.equal(result.state, 'completed');
    assert.deepEqual(
      result.entries.map((entry) => entry.answer.phase),
      ['sent', 'prefilled']
    );
    assert.deepEqual(
      env.state.sends.map(({ chat, text }) => ({ chat, text })),
      [{ chat: '8', text: 'Yes' }]
    );
    assert.deepEqual(env.state.prefills, [{ chat: '9', text: 'Yes' }]);
    assert.equal(result.restoration.restored, false);
    assert.equal(result.restoration.heldReview.chat, '9');
    assert.equal((await listOutbox(env.store)).length, 1);
    assert.equal(
      (await env.store.get(result.entries[1].reviewId)).planning.modelDraft,
      false
    );
  }));

test('pending bot options, unresolved text and owner drafts hold without edits or delivery', async () => {
  for (const snapshot of [
    { strictOptions: true, answerOptions: [] },
    { strictOptions: false, hasDraft: true },
    {
      strictOptions: false,
      question: { id: '102', body: 'Unrecognized request', outgoing: false },
    },
  ]) {
    await check({ rows: [snapshot, {}] }, async (env) => {
      const result = await env.complete();
      assert.equal(result.entries.length, 1);
      assert.equal(result.restoration.heldReview.chat, '8');
      assert.equal(env.state.prefills.length, 0);
      assert.equal(env.state.sends.length, 0);
      assert.deepEqual(await listOutbox(env.store), []);
    });
  }
});

test('a passive unread rejection advances only with a stable and complete native turn', async () => {
  const pendingQuestion = {
    id: '100',
    body: 'What time can you start?',
    outgoing: false,
  };
  for (const variant of [
    { verified: true },
    { historyComplete: false },
    { draft: true },
    { choice: true },
    { earlier: pendingQuestion },
    { changed: true },
    { text: 'We have chosen another interview date.' },
    { text: 'We cannot proceed without written authorization.' },
    { text: `${rejectionText} Please contact the hiring manager.` },
    { text: `${rejectionText} Please share your availability.` },
    { text: `${rejectionText} https://example.test/next` },
    { links: ['https://example.test/next'] },
  ]) {
    const history = noticeRows(variant.text ?? rejectionText);
    if (variant.earlier) {
      history.splice(1, 0, variant.earlier);
    }
    if (variant.links) {
      history.at(-1).links = variant.links;
    }
    const snapshot = noticeSnapshot(history);
    const { chat, ...row } = snapshot;
    assert.equal(chat, '7');
    await check(
      {
        rows: [
          {
            ...row,
            ...(variant.draft && { hasDraft: true }),
            ...(variant.choice && {
              strictOptions: true,
              answerOptions: ['Yes'],
            }),
          },
          { strictOptions: false },
        ],
        rejectionChats: ['8'],
        completeHistory: variant.historyComplete !== false,
        history: ({ chat }) => (chat === '8' ? history : []),
        readCurrent: variant.changed
          ? (current) => ({ ...current, hasDraft: true })
          : undefined,
      },
      async (env) => {
        const input = { ...env.input, rejectionsFirst: true };
        const result = await env.complete(input);
        const [first] = checkUnreadReview(result, input.id).entries;
        assert.equal(
          result.restoration.heldReview.chat,
          variant.verified ? '9' : '8',
          JSON.stringify(variant)
        );
        assert.equal(
          first.answer.phase,
          variant.verified ? 'no-reply' : 'review',
          JSON.stringify(variant)
        );
        assert.equal(
          first.answer.reason === 'passive-rejection',
          Boolean(variant.verified)
        );
        assert.deepEqual(env.state.sends, []);
        assert.deepEqual(await listOutbox(env.store), []);
        if (!variant.verified) {
          assert.deepEqual(env.state.prefills, []);
        }
      }
    );
  }
});

test('review-only choices hold an approved bot answer without reserving or sending it', () =>
  check({}, async (env) => {
    const result = await env.complete({ ...env.input, reviewChoices: true });
    assert.equal(result.restoration.heldReview.chat, '8');
    assert.equal(result.reviewChoices, true);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].answer.phase, 'choice-review');
    const review = await env.browser.status({ id: result.entries[0].reviewId });
    assert.equal(review.plan.option, 'Yes');
    assert.deepEqual(env.state.sends, []);
    assert.deepEqual(env.state.prefills, []);
    assert.deepEqual(await listOutbox(env.store), []);
    checkUnreadReview(result, env.input.id);
  }));

const reuseQuestion = 'Can you work remotely?';
const reuseLabels = ['Да. Используем те же ответы', 'Нет. Отвечу заново'];
const reuseAnswer = {
  id: 'reuse-remote',
  question: reuseQuestion,
  answers: [{ text: 'Yes.', approved: true }],
};
const reuseSnapshot = (answers, extra = {}) => {
  const question = {
    id: '106',
    body: 'Используем эти ответы?',
    outgoing: false,
  };
  return {
    question,
    noticeContext: { canReply: false },
    answerOptions: reuseLabels,
    pendingTurn: {
      boundary: { kind: 'rendered-start' },
      messages: [
        { id: '103', body: 'Похоже, вы отвечали на часть вопросов:' },
        { id: '104', body: answers },
        question,
      ],
    },
    ...extra,
  };
};

test('confirmed reuse is the only automatic choice permitted alongside manual choices', async () => {
  for (const [answers, label] of [
    [`${reuseQuestion}: Да!`, reuseLabels[0]],
    [
      `${reuseQuestion}: No.\nWhat is your start date?: Monday.`,
      reuseLabels[1],
    ],
  ]) {
    await check({ rows: [reuseSnapshot(answers), {}] }, async (env) => {
      await saveAnswerRule(env.store, reuseAnswer);
      await saveSettings(env.store, { quietHours: { enabled: false } });
      const result = await env.complete({
        ...env.input,
        reviewChoices: true,
        autoReuseAnswers: true,
      });
      checkUnreadReview(result, env.input.id);
      assert.equal(result.entries[0].answer.phase, 'sent');
      assert.equal(result.entries[0].answer.selection.kind, 'answer-reuse');
      assert.equal(result.entries[0].answer.outbox.receipt.option, label);
      assert.equal(result.entries[1].answer.phase, 'choice-review');
      assert.equal(result.restoration.heldReview.chat, '9');
      assert.deepEqual(
        env.state.sends.map(({ text }) => text),
        [label]
      );
      assert.deepEqual(env.state.prefills, []);
      const withoutConsent = { ...result, autoReuseAnswers: undefined };
      assert.throws(() => checkUnreadReview(withoutConsent, env.input.id));
    });
  }
});

test('quiet hours, opt-outs, changed evidence and incomplete reuse offers keep the owner in control', async () => {
  const exact = `${reuseQuestion}: Yes.`;
  for (const [row, enabled, blocked, queued] of [
    [reuseSnapshot(exact), false],
    [reuseSnapshot('What is your start date?: Monday.'), true],
    [reuseSnapshot('Could you work remotely?: Yes.'), true],
    [reuseSnapshot(`${exact}\nPlease also finish another task.`), true],
    [reuseSnapshot(`${exact}\nWhat is your name?: What do you mean?`), true],
    [reuseSnapshot(exact, { hasDraft: true }), true],
    [
      reuseSnapshot(exact, {
        answerOptions: [reuseLabels[0], 'Да', reuseLabels[1]],
      }),
      true,
    ],
    [reuseSnapshot(exact), true, { optOut: [{ source: 'hh', chat: 'web:8' }] }],
    [
      reuseSnapshot(exact),
      true,
      {
        quietHours: { enabled: true, from: '09:00', to: '11:00' },
        timezone: 'UTC',
      },
    ],
    [
      reuseSnapshot(exact),
      true,
      {},
      async (env) => {
        await saveAnswerRule(env.store, {
          ...reuseAnswer,
          answers: [{ text: 'No', approved: true }],
        });
      },
    ],
  ]) {
    await check({ rows: [row], queued }, async (env) => {
      await saveAnswerRule(env.store, reuseAnswer);
      await saveSettings(env.store, {
        quietHours: { enabled: false },
        ...blocked,
      });
      const result = await env.complete({
        ...env.input,
        reviewChoices: true,
        autoReuseAnswers: enabled,
      });
      checkUnreadReview(result, env.input.id);
      assert.equal(result.restoration?.heldReview.chat, '8');
      assert.equal(
        result.entries[0].answer.phase,
        queued ? 'failed' : 'choice-review'
      );
      assert.deepEqual(env.state.sends, []);
      assert.deepEqual(env.state.prefills, []);
    });
  }
});

test('the unread CLI and both wire formats preserve explicit consent to reuse', async () => {
  for (const media of [null, LINO_TEXT, LINO_BINARY]) {
    await check(
      { rows: [reuseSnapshot(`${reuseQuestion}: Yes.`)] },
      async (env) => {
        await saveAnswerRule(env.store, reuseAnswer);
        await saveSettings(env.store, { quietHours: { enabled: false } });
        env.input.reviewChoices = true;
        env.input.autoReuseAnswers = true;
        const result = await unreadAnswerClientReceipt(env, media, {
          'review-choices': true,
          'auto-reuse-answers': true,
        });
        assert.equal(result.autoReuseAnswers, true);
        assert.equal(
          result.entries[0].answer.outbox.receipt.option,
          reuseLabels[0]
        );
      }
    );
  }
});

test('the CLI and both wire formats retain the explicit choice review scope', async () => {
  for (const media of [null, LINO_TEXT, LINO_BINARY]) {
    await check({}, async (env) => {
      env.input.reviewChoices = true;
      const receipt = await unreadAnswerClientReceipt(env, media, {
        'review-choices': true,
      });
      assert.equal(receipt.reviewChoices, true);
      assert.equal(receipt.entries[0].answer.phase, 'choice-review');
      assert.equal(receipt.restoration.heldReview.chat, '8');
      assert.deepEqual(env.state.sends, []);
    });
  }
});

test(
  'polling retains manual choice review until an owner reply releases the hold',
  { timeout: 7000 },
  () => {
    const row = {};
    return check({ rows: [row, {}] }, async (env) => {
      const started = {
        ...env.input,
        reviewChoices: true,
        polling: { intervalMs: 1000 },
      };
      await env.browser.unreadStart(started);
      let sawHold = false;
      for (let i = 0; i < 150; i++) {
        const receipt = await env.browser.unreadStatus(started);
        if (receipt.polling.passes === 1 && receipt.restoration?.heldReview) {
          sawHold = true;
          assert.equal(receipt.restoration.heldReview.chat, '8');
          row.question = { id: '102', body: 'Yes', outgoing: true };
          row.strictOptions = false;
        }
        if (receipt.entries[0]?.answer?.phase === 'no-reply') {
          assert.equal(sawHold, true);
          assert.equal(receipt.reviewChoices, true);
          assert.equal(env.state.scans[1].heldChat, '8');
          assert.deepEqual(env.state.sends, []);
          assert.deepEqual(await listOutbox(env.store), []);
          return;
        }
        await delay(15);
      }
      assert.fail('Manual choice hold did not see the owner reply');
    });
  }
);

test('owner answers and a closed conversation continue to the next unread chat', () =>
  check(
    {
      rows: [
        {
          question: { id: '105', body: 'I have replied', outgoing: true },
          pendingTurn: {
            boundary: { kind: 'outgoing', id: '105', body: 'I have replied' },
            messages: [],
          },
        },
        { noticeContext: { canReply: false } },
        { strictOptions: false },
      ],
    },
    async (env) => {
      const result = await env.complete();
      assert.deepEqual(
        result.entries.map((entry) => entry.answer.phase),
        ['no-reply', 'no-reply', 'prefilled']
      );
      assert.equal(result.restoration.heldReview.chat, '10');
      assert.equal(env.state.sends.length, 0);
    }
  ));

test('uncertain choices stop traversal and status recovery never replays a click', () =>
  check({ issue: () => ({ via: 'browser' }) }, async (env) => {
    const result = await env.complete();
    assert.equal(result.state, 'paused');
    assert.equal(result.entries[0].answer.phase, 'unknown');
    assert.equal(result.entries.length, 1);
    const reader = createQuestionBrowser(env);
    try {
      assert.equal(
        (await reader.unreadStart(env.input)).entries[0].answer.phase,
        'unknown'
      );
      assert.equal(env.state.scans.length, 1);
      assert.equal(env.state.sends.length, 1);
    } finally {
      await reader.close();
    }
  }));

test('a queued saved-answer change refuses selection before the native effect', () =>
  check(
    {
      queued: (env) =>
        saveAnswerRule(env.store, {
          id: 'experience',
          question: env.state.snapshot.question.body,
          answers: [{ text: 'No', approved: true }],
        }),
    },
    async (env) => {
      const result = await env.complete();
      assert.equal(result.state, 'paused');
      assert.equal(result.entries[0].answer.phase, 'failed');
      assert.equal(env.state.sends.length, 0);
    }
  ));

test('wire receipts bind held review and delivered choices to the actual source and chat', () =>
  check({}, async (env) => {
    const result = await env.complete();
    for (const mutate of [
      (x) => {
        x.restoration.heldReview.url = 'javascript:alert(1)';
      },
      (x) => {
        x.restoration.heldReview.url = 'https://owner:password@hh.ru/chat/9';
      },
      (x) => {
        x.answerChats = false;
      },
      (x) => {
        x.restoration.restored = true;
      },
      (x) => {
        x.restoration.heldReview.chat = '10';
      },
      (x) => {
        x.restoration.heldReview.questionId = '999';
      },
      (x) => {
        x.entries[0].answer.outbox.chat = '9';
      },
      (x) => {
        x.entries[0].answer.outbox.receipt.source = 'vk';
      },
      (x) => {
        x.entries[0].answer.phase = 'marked-sent';
      },
      (x) => {
        x.entries[0].answer.selection.key = 'different';
      },
      (x) => {
        x.reviewChoices = true;
      },
    ]) {
      const forged = globalThis.structuredClone(result);
      mutate(forged);
      assert.throws(() => checkUnreadReview(forged, env.input.id));
    }
  }));

test(
  'repeating cycles stay on the held chat until an owner reply releases it',
  { timeout: 5000 },
  async () => {
    await check({ rows: [{ strictOptions: false }] }, async (env) => {
      const held = await env.complete();
      const released = {
        ...held,
        restoration: { restored: true, reason: 'checked' },
      };
      const inputs = [];
      let count = 0;
      const finite = {
        async start(input) {
          inputs.push(input);
          return count++ === 0 ? held : released;
        },
        async status() {
          assert.fail('A settled child needs no additional read');
        },
        async stop() {},
      };
      const { cycle, runtime } = pollingCycleFixture({ finite });
      runtime.input.answerChats = true;
      await cycle.visit();
      assert.equal(runtime.input.heldChat, '8');
      await cycle.visit();
      assert.equal(inputs[1].heldChat, '8');
      assert.equal(runtime.input.heldChat, undefined);
    });
  }
);

test(
  'CLI enables answer mode explicitly and negotiated Lino clients retain held receipts',
  { timeout: 10000 },
  async () => {
    const { questionBrowserCli, questionBrowserHttp } =
      await import('../../experiments/issue-56/question-browser-clients.mjs');
    await check({}, async (env) => {
      const result = await questionBrowserCli(env)('unread', {
        source: 'hh',
        confirm: true,
        'pass-id': env.input.id,
        'answer-chats': true,
      });
      assert.equal(result.code, 0, JSON.stringify(result.value));
      assert.equal(result.value.answerChats, true);
      assert.equal(result.value.restoration.heldReview.chat, '9');
    });
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      await check({}, async (env) => {
        const http = await questionBrowserHttp(env);
        try {
          const started = await http.call('unread-start', env.input, media);
          assert.equal(started.status, 200);
          await waitUnreadReview(env.browser, env.input.id);
          const response = await http.call(
            'unread-status',
            { id: env.input.id },
            media
          );
          assert.equal(response.status, 200);
          checkUnreadReview(response.body, env.input.id);
          assert.equal(response.body.restoration.heldReview.chat, '9');
        } finally {
          await http.server.close();
        }
      });
    }
  }
);

test(
  'Stop drains an issued option and retains its receipt without visiting another chat',
  { timeout: 5000 },
  async () => {
    const { questionWatchGate } =
      await import('../../experiments/issue-56/question-watch-fixture.mjs');
    const entered = questionWatchGate();
    const release = questionWatchGate();
    await check(
      {
        issue: async (draft) => {
          entered.release();
          await release.promise;
          return {
            via: 'browser',
            source: 'hh',
            chat: draft.chat,
            option: draft.text,
            messageId: '808',
          };
        },
      },
      async (env) => {
        try {
          await env.browser.unreadStart(env.input);
          await entered.promise;
          let settled = false;
          const stopping = env.browser.unreadStop(env.input).then((value) => {
            settled = true;
            return value;
          });
          await new Promise((resolve) => setTimeout(resolve, 20));
          assert.equal(settled, false);
          release.release();
          const result = await stopping;
          assert.equal(result.state, 'stopped');
          assert.equal(result.entries.length, 1);
          assert.equal(result.entries[0].answer.phase, 'sent');
          assert.equal(env.state.sends.length, 1);
        } finally {
          release.release();
        }
      }
    );
  }
);
