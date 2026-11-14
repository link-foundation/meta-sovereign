import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { normalizeNoticePolicy } from '../src/automation/question-notice-policy.js';
import {
  readAnswerPolicy,
  saveAnswerPolicy,
} from '../src/automation/question-policy.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { planNoticeReply } from '../src/automation/question-notice-plan.js';
import {
  noticeIntent,
  noticeAddsTask,
} from '../src/automation/question-notice-intent.js';
import {
  noticeSnapshot,
  noticeRows,
  rejectionText,
} from '../../experiments/issue-56/notice-policy-fixture.mjs';
import {
  noticeText,
  noticeReply,
  noticeRule,
} from '../../experiments/issue-56/notice-fixture.mjs';

const planFixture = async (body = noticeText) => {
  const store = createMemoryStore();
  const rows = noticeRows(body);
  await saveAnswerRule(store, noticeRule());
  await saveAnswerPolicy(store, {
    notices: { acknowledgements: 'reply', rejections: 'reply' },
  });
  return {
    store,
    target: { source: 'hh' },
    planning: {},
    snapshot: noticeSnapshot(rows),
    history: { rows, coverage: { complete: true }, restored: true },
  };
};

test('each saved notice policy defaults to review and invitations cannot auto-accept', async () => {
  const store = createMemoryStore();
  const policy = (await readAnswerPolicy(store)).notices;
  for (const kind of ['acknowledgements', 'rejections', 'invitations']) {
    assert.equal(policy[kind], 'review');
  }
  for (const input of [
    null,
    [],
    { invitations: 'reply' },
    { rejections: 'yes' },
    { rejectionReply: '' },
    { rejectionReply: 'x'.repeat(12001) },
  ]) {
    assert.throws(() => normalizeNoticePolicy(input));
  }
  const saved = await saveAnswerPolicy(store, {
    notices: {
      acknowledgements: 'ignore',
      rejections: 'reply',
      rejectionReply: 'May I ask why?',
    },
  });
  assert.deepEqual((await readAnswerPolicy(store)).notices, saved.notices);
});

test('four-language notice intents distinguish acknowledgements, declines and added work', () => {
  for (const text of [
    noticeText,
    'Ваше резюме получено, мы рассмотрим вашу кандидатуру.',
    'आपका आवेदन प्राप्त हुआ है।',
    '您的申请已收到。',
  ]) {
    assert.equal(noticeIntent(text), 'acknowledgements', text);
    assert.equal(noticeAddsTask(text), false);
  }
  for (const text of [
    rejectionText,
    'Мы не готовы пригласить вас на собеседование.',
    'आपका आवेदन अस्वीकृत है।',
    '您的申请已被拒绝。',
  ]) {
    assert.equal(noticeIntent(text), 'rejections', text);
    assert.equal(noticeAddsTask(text), false, text);
  }
  for (const text of [
    'We invite you to an interview.',
    'Приглашаем на собеседование.',
    'आप साक्षात्कार के लिए आमंत्रित हैं।',
    '邀请您参加面试。',
  ]) {
    assert.equal(noticeIntent(text), 'invitations', text);
  }
  for (const text of [
    `${noticeText} Please call us.`,
    `${rejectionText} Complete this assignment.`,
    `${noticeText} https://example.test`,
    `${noticeText} 请填写表单。`,
  ]) {
    assert.equal(noticeAddsTask(text), true, text);
  }
});

test('only exact approved notice evidence authorizes an acknowledgement; ordinary review remains intact', async () => {
  const input = await planFixture();
  const result = await planNoticeReply(input);
  assert.equal(result.status, 'ready');
  assert.equal(result.historyVerified, true);
  assert.equal(result.text, noticeReply);
  assert.equal(result.evidence.requiresReview, true);
  for (const answers of [
    [{ text: noticeReply }],
    [{ text: '[без ответа]', approved: true }],
    [{ text: '{{missing}}', approved: true }],
    [
      { text: noticeReply, approved: true },
      { text: 'Other', approved: true },
    ],
  ]) {
    await saveAnswerRule(input.store, noticeRule({ answers }));
    assert.equal((await planNoticeReply(input)).status, 'review');
  }
});

test('admission requires full restored history, an identical pending turn and positive open job context', async () => {
  for (const mutate of [
    (input) => {
      input.history.coverage.complete = false;
    },
    (input) => {
      input.history.restored = false;
    },
    (input) => {
      delete input.snapshot.noticeContext;
    },
    (input) => {
      input.snapshot.noticeContext.canReply = false;
    },
    (input) => {
      input.snapshot.strictOptions = true;
    },
    (input) => {
      input.history.rows.splice(1, 0, {
        id: '0',
        body: 'Please send your CV.',
      });
    },
    (input) => {
      input.history.rows.at(-1).body += ' Changed';
    },
  ]) {
    const input = await planFixture();
    mutate(input);
    assert.equal((await planNoticeReply(input)).status, 'review');
  }
  const draft = await planFixture();
  draft.snapshot.hasDraft = true;
  assert.equal((await planNoticeReply(draft)).status, 'owner-draft');
});

test('one pending notice may follow a completed bot wrap-up, but requests and multiple notices remain for review', async () => {
  for (const bodies of [
    ['Your answers have been forwarded to the employer.', noticeText],
    [noticeText, 'The recruiter bot has finished.'],
  ]) {
    const input = await planFixture();
    input.history.rows = [
      noticeRows()[0],
      ...bodies.map((body, index) => ({
        id: String(101 + index),
        body,
        outgoing: false,
      })),
    ];
    input.snapshot = noticeSnapshot(input.history.rows);
    const result = await planNoticeReply(input);
    assert.equal(result.status, 'ready');
    assert.equal(result.message, bodies[0] === noticeText ? '101' : '102');
  }
  for (const body of [
    noticeText,
    'What time can you start?',
    'The recruiter bot has finished. Please send your CV.',
  ]) {
    const input = await planFixture();
    input.history.rows.splice(1, 0, { id: '100', body, outgoing: false });
    input.snapshot = noticeSnapshot(input.history.rows);
    assert.equal((await planNoticeReply(input)).status, 'review');
  }
});

test('any earlier owner response to a rejection ends automatic rejection replies for this chat', async () => {
  const input = await planFixture(rejectionText);
  assert.equal((await planNoticeReply(input)).status, 'ready');
  input.history.rows.splice(
    1,
    0,
    { id: '5', body: rejectionText, outgoing: false },
    { id: '6', body: 'I already replied manually.', outgoing: true }
  );
  input.snapshot = noticeSnapshot(input.history.rows);
  assert.equal(
    (await planNoticeReply(input)).reason,
    'rejection-already-answered'
  );
  await saveAnswerPolicy(input.store, { notices: { rejections: 'ignore' } });
  assert.equal((await planNoticeReply(input)).status, 'ignored');
});
