import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAnswerRule,
  planAnswer,
} from '../src/automation/question-answers.js';
import {
  matchNotice,
  NO_NOTICE_REPLY,
} from '../src/automation/question-notices.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import {
  noticeText,
  noticeReply,
  noticeRule,
  noticeMessage,
} from '../../experiments/issue-56/notice-fixture.mjs';

test('notice approvals retain their kind without changing existing question records', () => {
  assert.equal(normalizeAnswerRule(noticeRule()).kind, 'notice');
  assert.equal(
    normalizeAnswerRule(noticeRule({ kind: 'question' })).kind,
    undefined
  );
  for (const patch of [
    { kind: 'script' },
    { question: 'Where do you live?' },
    { questions: ['Please send your passport.'] },
  ]) {
    assert.throws(() => normalizeAnswerRule(noticeRule(patch)));
  }
  assert.throws(() =>
    normalizeAnswerRule(
      noticeRule({
        kind: 'question',
        answers: [{ text: NO_NOTICE_REPLY, approved: true }],
      })
    )
  );
});

test('reviewed notice replies ignore bounded greetings and explicit signatures in four languages', () => {
  for (const [core, received] of [
    [noticeText, `Hello, Alice! ${noticeText}\nBest regards,\nRecruiter`],
    [
      'Мы рассмотрим ваше резюме и опыт.',
      'Здравствуйте, Анна! Мы рассмотрим ваше резюме и опыт.\nС уважением,\nИрина',
    ],
    [
      'हम आपके आवेदन की समीक्षा करेंगे।',
      'नमस्ते! हम आपके आवेदन की समीक्षा करेंगे।',
    ],
    ['我们会审核您的申请。', '您好！我们会审核您的申请。'],
  ]) {
    const result = planAnswer(received, {
      rules: [noticeRule({ question: core })],
    });
    assert.equal(result.text, noticeReply, received);
    assert.equal(result.match, 'exact');
    assert.equal(result.notice, true);
    assert.equal(
      result.requiresReview,
      true,
      'a notice is never a free-text automatic send'
    );
    assert.equal(result.question, received, 'original transcript stays intact');
  }
});

test('passive patterns and contained templates cannot consume new actionable text', () => {
  assert.equal(
    matchNotice(
      'Ваше резюме … опыт* … свяже* с вами',
      'Ваше резюме и опыт подходят нам, свяжемся с вами'
    ),
    'template'
  );
  assert.equal(
    matchNotice(
      noticeText,
      `Application update. ${noticeText} Our team is busy.`
    ),
    'template'
  );
  for (const suffix of [
    ' Where do you live?',
    ' Please send your passport.',
    '\nBest regards, where do you live?',
    ' Interview on Monday.',
    ' Fill https://forms.example.test/private.',
    ' Unfortunately, rejected.',
    ' Приглашаем на встречу.',
    ' Заполните анкету.',
    ' कृपया अपना नाम भेजें।',
    ' 请提供联系方式。',
  ]) {
    const result = planAnswer(noticeText + suffix, { rules: [noticeRule()] });
    assert.equal(result.text, '', suffix);
    assert.notEqual(result.noReply, true, suffix);
  }
  assert.equal(matchNotice('…', noticeText), null);
  assert.equal(matchNotice(noticeText, 'x'.repeat(6001)), null);
});

test('notice rules cannot answer questions, form labels or strict native choices', () => {
  const rules = [noticeRule()];
  for (const options of [
    { questionMode: 'field' },
    { strictOptions: true },
    { options: [noticeReply] },
  ]) {
    const result = planAnswer(noticeText, { ...options, rules });
    assert.equal(result.text, '');
    assert.equal(result.complete, false);
  }
  assert.equal(planAnswer('What is your email?', { rules }).text, '');
  assert.equal(
    planAnswer(noticeText, { rules: [noticeRule({ kind: 'question' })] }).text,
    ''
  );
});

test('no-reply notices require a current approved unambiguous non-approximate rule', () => {
  const rule = noticeRule({
    answers: [{ text: NO_NOTICE_REPLY, approved: true }],
  });
  const result = planAnswer(noticeText, { rules: [rule] });
  assert.equal(result.noReply, true);
  assert.equal(result.text, '');
  assert.equal(result.requiresReview, false);
  const contained = planAnswer(
    `Application update. ${noticeText} Our team is busy.`,
    {
      rules: [rule],
    }
  );
  assert.equal(contained.match, 'template');
  assert.equal(contained.requiresReview, true);
  assert.notEqual(contained.noReply, true);
  assert.equal(contained.text, '');
  for (const rules of [
    [{ ...rule, answers: [{ text: NO_NOTICE_REPLY, approved: false }] }],
    [
      rule,
      noticeRule({
        id: 'qa-rule:conflict',
        answers: [{ text: 'Different reply', approved: true }],
      }),
    ],
  ]) {
    const proposed = planAnswer(noticeText, { rules });
    assert.notEqual(proposed.noReply, true);
    assert.equal(proposed.requiresReview, true);
    assert.notEqual(proposed.text, NO_NOTICE_REPLY);
  }
  const approximate = planAnswer(
    noticeText.replace('your application', 'your recent application'),
    { rules: [rule] }
  );
  assert.equal(approximate.match, 'approximate');
  assert.notEqual(approximate.noReply, true);
  assert.equal(approximate.text, '');
});

test('notice matching keeps scope, case, current substitutions and rejection policy', () => {
  const rule = noticeRule({
    sources: ['hh'],
    chats: ['hh:notice'],
    answers: [{ text: 'Thanks, {{name}}.', approved: true }],
  });
  const context = {
    rules: [rule],
    source: 'hh',
    chat: 'notice',
    profile: { name: 'Owner' },
  };
  assert.equal(planAnswer(noticeText, context).text, 'Thanks, Owner.');
  for (const patch of [
    { source: 'telegram' },
    { chat: 'other' },
    { policy: { rejected: ['Owner'] } },
  ]) {
    assert.equal(planAnswer(noticeText, { ...context, ...patch }).text, '');
  }
  const missing = planAnswer(noticeText, { ...context, profile: {} });
  assert.equal(missing.complete, false);
  assert.deepEqual(missing.missing, ['name']);
  assert.equal(
    planAnswer(noticeText.toUpperCase(), {
      ...context,
      approximate: false,
      matching: { caseSensitive: true },
    }).text,
    ''
  );
});

test(
  'all provider automations retain reviewed notice drafts without dispatching them',
  { timeout: 10000 },
  async () => {
    for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
      const store = createMemoryStore();
      for (const record of [
        noticeMessage(source),
        normalizeAnswerRule(noticeRule()),
        normalizeAutomation({
          id: 'notices',
          action: { kind: 'answer-questions' },
          conditions: { mutual: false, cooldownDays: 0 },
        }),
      ]) {
        await store.put(record);
      }
      let sends = 0;
      const runner = createAutomationRunner({
        store,
        self: ['me'],
        send: async () => {
          sends++;
        },
      });
      const plan = await runner.plan(await runner.load('notices'), {
        targets: [{ source, chat: 'notice' }],
      });
      assert.equal(plan.drafts[0].text, noticeReply, source);
      const outcome = await runner.deliverDraft('notices', plan.drafts[0]);
      assert.equal(outcome.code, 'answer-review-required');
      assert.equal(sends, 0);
    }
  }
);
