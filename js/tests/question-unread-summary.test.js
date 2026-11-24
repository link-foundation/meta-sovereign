import assert from 'node:assert/strict';
import test from 'node:test';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import {
  noReplyFollowupRule,
  summary,
  summaryFollowup,
} from '../../experiments/issue-56/question-summary-fixture.mjs';
import { unreadInput } from '../../experiments/issue-56/question-unread-review-fixture.mjs';
import { unreadAnswerClientReceipt } from '../../experiments/issue-56/question-browser-clients.mjs';
import {
  listAnswerRules,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { listOutbox } from '../src/automation/outbox.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';

const summaryRow = (extra = {}) => ({
  strictOptions: false,
  question: { id: '301', body: summary, outgoing: false },
  ...extra,
});

const history = ({ question, pendingTurn }) =>
  (pendingTurn?.messages ?? [question]).map((message) => ({
    ...message,
    outgoing: false,
    sender: 'recruiter-bot',
    timestamp: '2026-11-09T11:00:00Z',
  }));

const fixture = async (options, run) => {
  const env = await unreadAnswerFixture({
    rows: [summaryRow(), { strictOptions: false }],
    history,
    ...options,
  });
  try {
    await run(env);
    assert.deepEqual(env.state.sends, []);
    assert.deepEqual(await listOutbox(env.store), []);
  } finally {
    await env.browser.close();
  }
};

const summaryAnswers = async (store, id = '301') =>
  (await listAnswerRules(store)).flatMap((rule) =>
    rule.answers.filter((answer) => answer.evidence.includes(`msg:hh:8:${id}`))
  );

test('a completed unread handover saves only unapproved facts before moving on', () => {
  const visited = [];
  return fixture(
    {
      afterVisit: async (env) => {
        visited.push((await summaryAnswers(env.store)).length);
      },
    },
    async (env) => {
      for (const input of [env.input, unreadInput({ answerChats: true })]) {
        const result = await env.complete(input);
        assert.equal(visited.at(-2), 2);
        assert.deepEqual(
          result.entries.map((entry) => entry.answer.phase),
          ['no-reply', 'prefilled']
        );
        assert.equal(result.entries[0].answer.summaryAnswers, 2);
        assert.equal(result.restoration.heldReview.chat, '9');
        assert.deepEqual(
          (await summaryAnswers(env.store)).map((answer) => [
            answer.text,
            answer.count,
            answer.approved,
            answer.evidence,
          ]),
          [
            ['Нет.', 0, false, ['msg:hh:8:301']],
            [
              'Разрабатывал поиск по техническим документам.',
              0,
              false,
              ['msg:hh:8:301'],
            ],
          ]
        );
      }
    }
  );
});

test('a summary changing after capture is held without learning the stale answer', () =>
  fixture(
    {
      readCurrent: (current) => ({
        ...current,
        question: { ...current.question, body: summary.replace('Нет.', 'Да.') },
      }),
    },
    async (env) => {
      const result = await env.complete();
      assert.equal(result.entries.length, 1);
      assert.equal(result.restoration.heldReview.chat, '8');
      assert.equal(
        result.entries[0].answer.reason,
        'question-unread-summary-unverified'
      );
      assert.equal(result.entries[0].answer.summaryAnswers, undefined);
      assert.equal((await summaryAnswers(env.store)).length, 0);
    }
  ));

test('summary receipts count only the observed version of an edited bubble', () => {
  const row = summaryRow();
  return fixture({ rows: [row, { strictOptions: false }] }, async (env) => {
    const first = await env.complete();
    assert.equal(first.entries[0].answer.summaryAnswers, 2);
    row.question = { ...row.question, body: summary.replace('Нет.', 'Да.') };
    const edited = await env.complete(unreadInput({ answerChats: true }));
    assert.equal(edited.entries[0].answer.summaryAnswers, 2);
    assert.deepEqual(
      (await summaryAnswers(env.store)).map((answer) => answer.text),
      ['Нет.', 'Да.', 'Разрабатывал поиск по техническим документам.']
    );
  });
});

test('missing archive evidence holds the summary', () =>
  fixture({ history: undefined }, async (env) => {
    const result = await env.complete();
    assert.equal(result.entries.length, 1);
    assert.equal(
      result.entries[0].answer.reason,
      'question-unread-summary-unverified'
    );
    assert.equal(result.restoration.heldReview.chat, '8');
    assert.deepEqual(await summaryAnswers(env.store), []);
  }));

test('review-only mode does not learn the summary', () =>
  fixture({}, async (env) => {
    const result = await env.complete(unreadInput());
    assert.equal(result.entries.length, 2);
    assert.equal(result.entries[0].answer, undefined);
    assert.deepEqual(await summaryAnswers(env.store), []);
  }));

test('a durable write failure holds the summary and a same-chat retry saves it', () =>
  fixture({}, async (env) => {
    const flush = env.store.flush?.bind(env.store);
    let failNextAnswerWrite = true;
    env.store.flush = async () => {
      if (failNextAnswerWrite && (await summaryAnswers(env.store)).length > 0) {
        failNextAnswerWrite = false;
        throw new Error('Fixture answer write did not flush');
      }
      await flush?.();
    };
    const held = await env.complete();
    assert.equal(held.entries.length, 1);
    assert.equal(held.restoration.heldReview.chat, '8');
    assert.equal(
      held.entries[0].answer.reason,
      'question-unread-summary-save-failed'
    );
    assert.deepEqual(await summaryAnswers(env.store), []);
    const retried = await env.complete(
      unreadInput({ answerChats: true, heldChat: '8' })
    );
    assert.equal(retried.entries[0].answer.summaryAnswers, 2);
    assert.equal((await summaryAnswers(env.store)).length, 2);
  }));

const pendingSummary = (body, preceding = []) => {
  const row = summaryRow({ question: { id: '301', body, outgoing: false } });
  row.pendingTurn = {
    boundary: { kind: 'rendered-start' },
    messages: [...preceding, row.question],
  };
  return row;
};

const earlierSummary = { id: '300', body: summary };
const differentSummary = summary
  .replace('Rust', 'Java')
  .replace('Нет.', 'Да.')
  .replace('с поиском', 'с тестированием')
  .replace(
    'Разрабатывал поиск по техническим документам.',
    'Писал интеграционные тесты.'
  );

test('a no-reply turn saves all completed summaries with their own evidence', () =>
  fixture(
    {
      rows: [
        pendingSummary(differentSummary, [earlierSummary]),
        { strictOptions: false },
      ],
    },
    async (env) => {
      const result = await env.complete();
      assert.equal(result.restoration.heldReview.chat, '9');
      assert.equal(result.entries[0].answer.phase, 'no-reply');
      assert.equal(result.entries[0].answer.summaryAnswers, 4);
      for (const id of ['300', '301']) {
        const answers = await summaryAnswers(env.store, id);
        assert.equal(answers.length, 2);
        for (const answer of answers) {
          assert.deepEqual(answer.evidence, [`msg:hh:8:${id}`]);
          assert.equal(answer.approved, false);
          assert.equal(answer.count, 0);
        }
      }
    }
  ));

test('a bounded no-reply turn retains a summary receipt above the per-message limit', () => {
  const batch = (start) =>
    [
      'Your answers:',
      ...Array.from(
        { length: 11 },
        (_, i) => `Did you complete module ${start + i}?: Yes.`
      ),
    ].join('\n');
  const first = { id: '300', body: batch(1) };
  const row = pendingSummary(batch(12), [first]);
  return fixture({ rows: [row, { strictOptions: false }] }, async (env) => {
    const result = await env.complete();
    assert.equal(result.restoration.heldReview.chat, '9');
    assert.equal(result.entries[0].answer.summaryAnswers, 22);
  });
});

test('an approved no-reply follow-up keeps the earlier summary facts', async () => {
  for (const approved of [true, false]) {
    await fixture(
      {
        rows: [
          pendingSummary(summaryFollowup, [earlierSummary]),
          { strictOptions: false },
        ],
      },
      async (env) => {
        await saveAnswerRule(env.store, noReplyFollowupRule(approved));
        const result = await env.complete();
        assert.equal(result.restoration.heldReview.chat, approved ? '9' : '8');
        assert.equal(
          result.entries[0].answer.phase,
          approved ? 'no-reply' : 'review'
        );
        assert.equal(
          result.entries[0].answer.summaryAnswers,
          approved ? 2 : undefined
        );
        assert.equal(
          (await summaryAnswers(env.store, '300')).length,
          approved ? 2 : 0
        );
        assert.deepEqual(await summaryAnswers(env.store), []);
      }
    );
  }
});

test('a second handover cannot advance over an earlier missing or edited summary', async () => {
  const entry = pendingSummary(differentSummary, [earlierSummary]);
  for (const options of [
    {
      history: (snapshot) =>
        history(snapshot).filter((message) => message.id !== '300'),
    },
    {
      readCurrent: (snapshot) => ({
        ...snapshot,
        pendingTurn: {
          ...snapshot.pendingTurn,
          messages: [
            { ...earlierSummary, body: summary.replace('Нет.', 'Да.') },
            snapshot.question,
          ],
        },
      }),
    },
  ]) {
    await fixture(
      { rows: [entry, { strictOptions: false }], ...options },
      async (env) => {
        const result = await env.complete();
        assert.equal(result.restoration.heldReview.chat, '8');
        assert.equal(
          result.entries[0].answer.reason,
          'question-unread-summary-unverified'
        );
        assert.deepEqual(await summaryAnswers(env.store, '300'), []);
        assert.deepEqual(await summaryAnswers(env.store), []);
      }
    );
  }
});

test('a summary cannot displace an owner draft or an earlier unanswered request', async () => {
  for (const [row, phase] of [
    [summaryRow({ hasDraft: true }), 'owner-draft'],
    [
      pendingSummary(summary, [
        { id: '300', body: 'Do you have distributed systems experience?' },
      ]),
      'prefilled',
    ],
  ]) {
    await fixture({ rows: [row, { strictOptions: false }] }, async (env) => {
      const result = await env.complete();
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].answer.phase, phase);
      assert.equal(result.restoration.heldReview.chat, '8');
      assert.deepEqual(await summaryAnswers(env.store), []);
    });
  }
});

test('a form URL quoted by a handover is not opened and private or questioning answers are excluded', () => {
  const url = 'https://forms.gle/ExampleForm1';
  const body = summary.replace(
    '\n\nВопросы',
    `\n- Где найти анкету? Ответ:\n- ${url}\n- Какой личный URL? Ответ:\n- https://example.test/private?access_token=fixture\n- Когда вы начнёте? Ответ:\n- А когда вам удобно?\n\nВопросы`
  );
  return fixture(
    {
      rows: [pendingSummary(body), { strictOptions: false }],
      prefillLinkedForm: () => assert.fail('A quoted form cannot open'),
    },
    async (env) => {
      const result = await env.complete({ ...env.input, prefillForms: true });
      assert.equal(result.restoration.heldReview.chat, '9');
      assert.equal(result.entries[0].answer.phase, 'no-reply');
      assert.equal(result.entries[0].form, undefined);
      const texts = (await summaryAnswers(env.store)).map(
        (answer) => answer.text
      );
      assert.ok(texts.includes('Нет.'));
      assert.ok(
        texts.every(
          (text) =>
            !text.includes('access_token') && !text.includes('когда вам')
        )
      );
      assert.equal(result.entries[0].answer.summaryAnswers, texts.length);
    }
  );
});

test(
  'the CLI and both Lino media retain the summary receipt',
  { timeout: 10000 },
  async () => {
    for (const media of [undefined, LINO_TEXT, LINO_BINARY]) {
      await fixture({}, async (env) => {
        const receipt = await unreadAnswerClientReceipt(env, media);
        assert.equal(receipt.entries[0].answer.summaryAnswers, 2);
        assert.equal(receipt.restoration.heldReview.chat, '9');
      });
    }
  }
);
