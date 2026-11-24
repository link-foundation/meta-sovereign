import assert from 'node:assert/strict';
import test from 'node:test';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import { unreadInput } from '../../experiments/issue-56/question-unread-review-fixture.mjs';
import { unreadAnswerClientReceipt } from '../../experiments/issue-56/question-browser-clients.mjs';
import {
  noticeReply as templateReply,
  noticeText,
} from '../../experiments/issue-56/notice-fixture.mjs';
import { noticePatternVariant } from '../../experiments/issue-56/notice-learning-fixture.mjs';
import { listAnswerRules } from '../src/automation/question-store.js';
import { listOutbox } from '../src/automation/outbox.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';

const reply = 'I build document search around a local full-text index.';
const noticeReply = 'Thanks for letting me know.';
const typed = (id, body, options = {}) => ({
  id: String(id),
  body,
  outgoing: false,
  timestamp: `2026-11-09T11:${String(id - 800).padStart(2, '0')}:00Z`,
  ...options,
});
const outgoing = (id, text, options) =>
  typed(id, text, { outgoing: true, delivery: 'delivered', ...options });
const archived = [
  typed(801, 'How do you build a document search?'),
  outgoing(802, reply),
  typed(803, 'We will review your application this week.'),
  outgoing(804, noticeReply),
  typed(805, 'Can you start on Thursday?'),
  outgoing(806, 'Would Friday work?'),
];

const observed = async (store) =>
  (await listAnswerRules(store)).flatMap((rule) =>
    rule.answers
      .filter((answer) =>
        answer.evidence.some((id) => id.startsWith('msg:hh:8:'))
      )
      .map((answer) => ({ kind: rule.kind ?? 'question', ...answer }))
  );

const fixture = async (rows, options, work) => {
  const env = await unreadAnswerFixture({
    rows: [
      { strictOptions: false, question: rows.at(-1) },
      { strictOptions: false },
    ],
    history: ({ chat }) => (chat === '8' ? rows : []),
    ...options,
  });
  try {
    await work(env);
    assert.deepEqual(await listOutbox(env.store), []);
    assert.deepEqual(env.state.sends, []);
  } finally {
    await env.browser.close();
  }
};

test('sequential unread handling keeps older verified owner answers before moving on', () => {
  const progress = [];
  return fixture(
    archived,
    {
      afterVisit: async ({ store }) =>
        progress.push((await observed(store)).length),
    },
    async (env) => {
      for (const input of [env.input, unreadInput({ answerChats: true })]) {
        const result = await env.complete(input);
        assert.deepEqual(
          result.entries.map(({ chat }) => chat),
          ['8', '9']
        );
        assert.equal(progress.at(-2), 2);
        assert.equal(result.entries[0].answer.historyAnswers, 2);
        assert.deepEqual(
          (await observed(env.store)).map(
            ({ kind, text, count, approved, evidence }) => [
              kind,
              text,
              count,
              approved,
              evidence,
            ]
          ),
          [
            ['question', reply, 1, false, ['msg:hh:8:802']],
            ['notice', noticeReply, 1, false, ['msg:hh:8:804']],
          ]
        );
      }
    }
  );
});

test('review-only passes keep the archive separate from learned answers', () =>
  fixture(archived, {}, async (env) => {
    const result = await env.complete(unreadInput());
    assert.equal(result.entries.length, 2);
    assert.ok(await env.store.get('msg:hh:8:802'));
    assert.deepEqual(await observed(env.store), []);
  }));

test('older history learns only from positively delivered turns with a verified date', () =>
  fixture(
    [
      typed(801, 'How do you build a document search?'),
      outgoing(802, reply, { delivery: 'unknown' }),
      typed(803, 'We will review your application this week.', {
        timestamp: null,
      }),
      outgoing(804, noticeReply),
      typed(805, 'Can you start on Thursday?'),
      outgoing(806, 'Confirmed dates are flexible.', { service: true }),
      typed(807, 'How do you test search results?'),
      outgoing(808, 'I compare rankings against the expected matches.'),
    ],
    {},
    async (env) => {
      const result = await env.complete();
      assert.equal(result.entries[0].answer.historyAnswers, 1);
      assert.deepEqual(
        (await observed(env.store)).map((answer) => answer.evidence),
        [['msg:hh:8:808']]
      );
    }
  ));

test('an uncertain continuation invalidates a partial answer and a changed chat stays held', async () => {
  await fixture(
    [
      typed(801, 'How do you build a document search?'),
      outgoing(802, reply),
      outgoing(803, 'This next part had no usable date.', { timestamp: null }),
      ...archived.slice(3),
    ],
    {},
    async (env) => {
      const result = await env.complete();
      assert.equal(result.entries[0].answer.historyAnswers, undefined);
      assert.deepEqual(await observed(env.store), []);
    }
  );
  await fixture(
    archived,
    {
      readCurrent: (snapshot) => ({
        ...snapshot,
        question: { ...snapshot.question, body: 'The conversation changed.' },
      }),
    },
    async (env) => {
      const result = await env.complete();
      assert.equal(result.entries.length, 1);
      assert.equal(
        result.entries[0].answer.reason,
        'question-unread-history-unverified'
      );
      assert.equal(result.restoration.heldReview.chat, '8');
      assert.deepEqual(await observed(env.store), []);
    }
  );
});

test('failed history knowledge writes leave the chat held and are safe to retry', () =>
  fixture(archived, {}, async (env) => {
    const flush = env.store.flush?.bind(env.store);
    let failed = false;
    env.store.flush = async () => {
      if (!failed && (await observed(env.store)).length) {
        failed = true;
        throw new Error('Fixture answer write did not flush');
      }
      await flush?.();
    };
    const held = await env.complete();
    assert.equal(
      held.entries[0].answer.reason,
      'question-unread-history-save-failed'
    );
    assert.equal(held.restoration.heldReview.chat, '8');
    assert.deepEqual(await observed(env.store), []);
    const retried = await env.complete(
      unreadInput({ answerChats: true, heldChat: '8' })
    );
    assert.equal(retried.entries[0].answer.historyAnswers, 2);
    assert.deepEqual(
      (await observed(env.store)).map((answer) => answer.count),
      [1, 1]
    );
  }));

const relatedNoticeFixture = async () => {
  const first = [typed(801, noticeText), outgoing(802, templateReply)];
  const second = [
    typed(803, noticePatternVariant),
    outgoing(804, templateReply),
  ];
  return unreadAnswerFixture({
    rows: [first, second].map((rows) => ({
      strictOptions: false,
      question: rows.at(-1),
    })),
    history: ({ chat }) => (chat === '8' ? first : second),
  });
};

const relatedNotices = async (store) =>
  (await listAnswerRules(store)).filter((rule) =>
    [noticeText, noticePatternVariant].includes(rule.question)
  );

test('separate verified chats extend and keep a shared review-only notice pattern', async () => {
  const env = await relatedNoticeFixture();
  try {
    for (const input of [env.input, unreadInput({ answerChats: true })]) {
      const result = await env.complete(input);
      assert.deepEqual(
        result.entries.map(({ answer }) => answer.historyAnswers),
        [1, 1]
      );
      const notices = await relatedNotices(env.store);
      assert.equal(notices.length, 2);
      const [pattern] = notices[0].learnedPatterns;
      assert.match(pattern, /experience\*/u);
      for (const { answers, learnedPatterns } of notices) {
        assert.deepEqual(learnedPatterns, [pattern]);
        assert.equal(answers[0].approved, false);
        assert.equal(answers[0].count, 1);
      }
    }
    assert.deepEqual(env.state.sends, []);
    assert.deepEqual(await listOutbox(env.store), []);
  } finally {
    await env.browser.close();
  }
});

test('a pattern save failure leaves both confirmed replies and recomputes safely on retry', async () => {
  const env = await relatedNoticeFixture();
  try {
    const flush = env.store.flush?.bind(env.store);
    const notices = () => relatedNotices(env.store);
    let failed = false;
    env.store.flush = async () => {
      if (
        !failed &&
        (await notices()).some((rule) => rule.learnedPatterns?.length)
      ) {
        failed = true;
        throw new Error('Fixture pattern did not flush');
      }
      await flush?.();
    };
    const held = await env.complete();
    assert.equal(
      held.entries[1].answer.reason,
      'question-unread-history-save-failed'
    );
    assert.equal(held.restoration.heldReview.chat, '9');
    assert.equal((await notices()).length, 2);
    assert.ok((await notices()).every((rule) => !rule.learnedPatterns?.length));
    const retried = await env.complete(
      unreadInput({ answerChats: true, heldChat: '9' })
    );
    assert.equal(retried.entries[0].answer.historyAnswers, 1);
    assert.ok(
      (await notices()).every((rule) => rule.learnedPatterns?.length === 1)
    );
    assert.deepEqual(env.state.sends, []);
  } finally {
    await env.browser.close();
  }
});

test(
  'the foreground CLI and both Lino encodings recover the history receipt',
  { timeout: 10000 },
  async () => {
    for (const media of [undefined, LINO_TEXT, LINO_BINARY]) {
      await fixture(archived, {}, async (env) => {
        const receipt = await unreadAnswerClientReceipt(env, media);
        assert.equal(receipt.entries[0].answer.historyAnswers, 2);
      });
    }
  }
);
