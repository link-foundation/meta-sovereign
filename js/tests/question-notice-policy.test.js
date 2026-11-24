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
  savedRussianNotice,
  russianThanks,
  activeReview,
  botBinarySummary,
  botHandover,
  recognizedNoticeRule,
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

const companyInfo =
  'Вы также можете узнать больше о нас и ознакомиться с другими вакансиями по ссылке: https://hh.ru/employer/10726025';

const recognizedFixture = async (body, mode = 'reply-recognized') => {
  const input = await planFixture(body);
  await saveAnswerRule(input.store, recognizedNoticeRule());
  await saveAnswerPolicy(input.store, { notices: { acknowledgements: mode } });
  return input;
};

test('recognized review and screening notices reuse same-language saved thanks only in the selected mode', async () => {
  for (const body of [
    activeReview,
    'Добрый день! Спасибо за Ваш отклик! Мы рассмотрим Ваше резюме в ближайшее время и вернемся с обратной связью.',
    'Ваше резюме находится на этапе рассмотрения.',
    'В течение двух рабочих дней мы рассмотрим Ваш отклик и вернёмся с обратной связью.',
    'Нам нужно немного времени, чтобы ознакомиться с вашим резюме и решить, какие этапы предложить. Постараемся вернуться с фидбеком как можно скорее. Хорошего дня!',
    'Нам потребуется время, чтобы изучить ваше резюме. Планируем вернуться с обратной связью на следующей неделе.',
    'Сейчас мы проводим первичный отбор по резюме. Приём входящих звонков временно приостановлен. Пожалуйста, не звоните: мы сами напишем или позвоним подходящим кандидатам.',
    'В данный момент идёт предварительный отбор кандидатов по резюме. Мы сами свяжемся с теми, чей опыт подойдёт.',
    'Мы ведём отбор по резюме. Когда выберем подходящих кандидатов, напишем им. Входящие звонки пока не принимаем.',
    'Компания Волга рассмотрит Ваше резюме на вакансию Разработчик и позже сообщит Вам о своем решении.',
    'Ваш отклик мы получили! Внимательно изучим ваше резюме. Если ваш опыт совпадёт с нашими задачами — наша команда свяжется с вами.',
    'Спасибо за ваш отклик, ознакомимся с Вашим резюме и дадим обратную связь.',
    'Благодарим вас за проявленный интерес к нашей компании Волга, а также за участие в процессе отбора на позицию Python разработчик. Мы ценим время и усилия, которые вы вложили в знакомство с нами. На данный момент мы продолжаем рассматривать кандидатов и анализировать результаты собеседований. Ваша кандидатура остается в числе тех, кто нас заинтересовал. Если мы примем положительное решение -- обязательно свяжемся с вами в ближайшее время.',
  ]) {
    const input = await recognizedFixture(body);
    const result = await planNoticeReply(input);
    assert.equal(result.status, 'ready', body);
    assert.equal(result.text, russianThanks, body);
    assert.equal(result.evidence.recognizedAcknowledgement, true, body);
    assert.deepEqual(result.evidence.rules, ['qa-rule:older-russian-notice']);
  }
  for (const body of [
    'Your application is currently under review.',
    'Your CV is being reviewed.',
    'Thanks for applying! Our team will review your CV and contact you if your experience is a match.',
  ]) {
    const result = await planNoticeReply(await recognizedFixture(body));
    assert.equal(result.status, 'ready', body);
    assert.equal(result.text, noticeReply, body);
  }
  assert.equal(
    (await planNoticeReply(await recognizedFixture(activeReview, 'reply')))
      .status,
    'review'
  );
});

test('unknown requests, invitations, negated reviews, links and competing pending messages hold recognized replies', async () => {
  const notice = 'Мы рассмотрим Ваше резюме.';
  for (const body of [
    `${notice} Укажите Ваш Telegram.`,
    `${notice} Пришлите примеры кода.`,
    `${notice} Внесите сведения в профиль.`,
    `${notice} Когда сможете выйти?`,
    `${notice} Приглашаем на собеседование.`,
    `${notice} Мы выбрали другого кандидата.`,
    `${notice} https://example.test/next`,
    `${notice}\nUpload Portfolio`,
    `${notice}\nС уважением, Анна Примерова\nЗаполните анкету`,
    'Ваше резюме не находится на рассмотрении.',
    'Ваше резюме может быть рассмотрено.',
    'Мы не проводим первичный отбор по резюме. Напишем вам позже.',
    'Первичный отбор по резюме завершён. Мы свяжемся позднее.',
  ]) {
    const result = await planNoticeReply(await recognizedFixture(body));
    assert.equal(result.status, 'review', body);
    assert.equal(result.text, undefined, body);
  }
  const input = await recognizedFixture(activeReview);
  input.history.rows.splice(1, 0, {
    id: '100',
    body: 'Когда сможете выйти на работу?',
  });
  input.snapshot = noticeSnapshot(input.history.rows);
  assert.equal((await planNoticeReply(input)).status, 'review');
});

test('recognized notices allow explicitly optional HH company information with one verified destination', async () => {
  const notice = 'Мы рассмотрим Ваше резюме в ближайшее время.';
  const url = 'https://hh.ru/employer/10726025';
  for (const [paragraph, links, expected] of [
    [companyInfo, undefined, 'ready'],
    [companyInfo, [url], 'ready'],
    [companyInfo, ['https://forms.gle/abc'], 'review'],
    [companyInfo, [url, 'https://forms.gle/abc'], 'review'],
    [`${companyInfo}?to=elsewhere`, undefined, 'review'],
    [
      companyInfo.replace(url, 'https://hh.ru/employer/10726025/redirect'),
      undefined,
      'review',
    ],
    [
      companyInfo.replace(
        'Вы также можете узнать больше о нас и ознакомиться',
        'Перейдите и ознакомьтесь'
      ),
      undefined,
      'review',
    ],
    [`${companyInfo} . Пришлите телефон.`, undefined, 'review'],
  ]) {
    const input = await recognizedFixture(`${notice} ${paragraph} .`);
    input.history.rows.at(-1).links = links;
    input.snapshot = noticeSnapshot(input.history.rows);
    assert.equal((await planNoticeReply(input)).status, expected, paragraph);
  }
  const otherSource = await recognizedFixture(`${notice} ${companyInfo}`);
  otherSource.target.source = 'other';
  assert.equal((await planNoticeReply(otherSource)).status, 'review');
});

test('a complete binary bot handover allows the next human acknowledgement, with live questions and owner replies held', async () => {
  const summary = botBinarySummary;
  const handover = botHandover;
  for (const [prior, outcome] of [
    [[summary, handover], 'ready'],
    [[summary], 'review'],
    [[summary, 'Когда сможете выйти на работу?', handover], 'review'],
    [[summary, `${handover} Пришлите код.`], 'review'],
    [['Куда пришлёте ответы?: ДА', handover], 'review'],
    [['Есть ли опыт и пришлите примеры кода?: да', handover], 'review'],
  ]) {
    const input = await recognizedFixture(activeReview);
    const extra = prior.map((body, index) => ({
      id: String(index + 10),
      outgoing: false,
      body,
    }));
    input.history.rows.splice(1, 0, ...extra);
    input.snapshot = noticeSnapshot(input.history.rows);
    assert.equal(
      (await planNoticeReply(input)).status,
      outcome,
      prior.join(' / ')
    );
  }
  const answered = await recognizedFixture(activeReview);
  answered.history.rows.push({ id: '102', outgoing: true, body: 'Благодарю.' });
  answered.snapshot = noticeSnapshot(answered.history.rows);
  assert.equal((await planNoticeReply(answered)).status, 'waiting');
});

test('approved dominant wording counts distinct scoped examples, holds ties and respects explicit exact decisions', async () => {
  const input = await recognizedFixture(activeReview);
  const make = (id, question, text, override) =>
    recognizedNoticeRule({
      id: `qa-rule:${id}`,
      question,
      answers: [{ text, approved: true }],
      ...override,
    });
  await saveAnswerRule(
    input.store,
    make('thanks-short', 'Ваше резюме рассматривается.', 'Благодарю.')
  );
  await saveAnswerRule(
    input.store,
    make('duplicate', savedRussianNotice, russianThanks)
  );
  await saveAnswerRule(
    input.store,
    make('different-source', 'Мы получили ваше резюме.', russianThanks, {
      sources: ['other'],
    })
  );
  await saveAnswerRule(
    input.store,
    make('different-chat', 'Мы получили ваше резюме.', russianThanks, {
      chats: ['hh:8'],
    })
  );
  await saveAnswerRule(
    input.store,
    make('different-language', 'Мы получили ваше резюме.', 'Thank you.')
  );
  await saveAnswerRule(
    input.store,
    make('unapproved', 'Мы получили ваше резюме.', russianThanks, {
      answers: [{ text: russianThanks }],
    })
  );
  assert.equal((await planNoticeReply(input)).status, 'review');
  await saveAnswerRule(
    input.store,
    make('compatible', 'Мы изучим ваше резюме.', russianThanks, {
      chats: ['hh:7'],
    })
  );
  const approved = await planNoticeReply(input);
  assert.equal(approved.text, russianThanks);
  assert.equal(approved.evidence.rules.length, 2);
  await saveAnswerRule(
    input.store,
    make('explicit-review', activeReview, '[без ответа]')
  );
  assert.equal((await planNoticeReply(input)).status, 'review');
  await saveAnswerRule(
    input.store,
    make('explicit-review', activeReview, 'Спасибо.')
  );
  assert.equal((await planNoticeReply(input)).text, 'Спасибо.');
});

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

test('the exact chat override wins over its provider and inherits other fields', async () => {
  const input = await planFixture();
  await saveAnswerPolicy(input.store, {
    notices: {
      acknowledgements: 'reply',
      rejections: 'reply',
      rejectionReply: 'Global reason request.',
      overrides: [
        {
          source: 'hh',
          acknowledgements: 'ignore',
          rejectionReply: 'HeadHunter reason request.',
        },
        { source: 'hh', chat: '7', acknowledgements: 'review' },
      ],
    },
  });
  const decide = async (source, chat, body = noticeText) => {
    const rows = noticeRows(body);
    return planNoticeReply({
      ...input,
      target: { source, chat },
      snapshot: { ...noticeSnapshot(rows), chat },
      history: { ...input.history, rows },
    });
  };
  assert.equal((await decide('hh', '7')).status, 'review');
  assert.equal((await decide('hh', '8')).status, 'ignored');
  assert.equal((await decide('vk', '7')).status, 'ready');
  assert.equal(
    (await decide('hh', '7', rejectionText)).text,
    'HeadHunter reason request.'
  );
  assert.equal(
    (await decide('vk', '7', rejectionText)).text,
    'Global reason request.'
  );
});

test('invalid and duplicate overrides cannot replace a saved notice policy', async () => {
  const { store } = await planFixture();
  const original = await readAnswerPolicy(store);
  for (const overrides of [
    null,
    [{ chat: '7', acknowledgements: 'review' }],
    [{ source: 'hh', chat: ' ', acknowledgements: 'review' }],
    [{ source: 'hh', chat: '7', invitations: 'reply' }],
    [{ source: 'hh', rejectionReply: '' }],
    [{ source: 'hh', unrecognizedSetting: 'review' }],
    [{ source: 'hh' }],
    [
      { source: 'hh', chat: '7', rejections: 'ignore' },
      { source: 'hh', chat: '7', acknowledgements: 'review' },
    ],
  ]) {
    await assert.rejects(saveAnswerPolicy(store, { notices: { overrides } }));
    assert.deepEqual(await readAnswerPolicy(store), original);
  }
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
    `${noticeText} 麻烦完成问卷。`,
    `${noticeText} Заодно пройдите тест.`,
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

for (const [name, body, links] of [
  [
    'an acknowledgement with a native action anchor',
    noticeText,
    ['https://example.test/next'],
  ],
  [
    'a rejection with a native action anchor',
    rejectionText,
    ['https://example.test/next'],
  ],
  [
    'an exact acknowledgement with a bare destination',
    `${noticeText} careers.example/next.`,
  ],
  [
    'a rejection with a contact destination',
    `${rejectionText} tel:+12025550100`,
  ],
]) {
  test(`notice reply leaves ${name} for review`, async () => {
    const input = await planFixture(body);
    if (links) {
      input.history.rows.at(-1).links = links;
      input.snapshot = noticeSnapshot(input.history.rows);
    }
    if (body.startsWith(noticeText)) {
      await saveAnswerRule(input.store, noticeRule({ question: body }));
    }
    const result = await planNoticeReply(input);
    assert.equal(result.historyVerified, true);
    assert.equal(result.status, 'review');
    assert.equal(result.text, undefined);
  });
}

test('a completed handover with an embedded link stays in the pending turn', async () => {
  const input = await planFixture();
  input.history.rows.splice(1, 0, {
    id: '100',
    body: 'Your answers have been forwarded to the employer.',
    outgoing: false,
    links: ['https://example.test/next'],
  });
  input.snapshot = noticeSnapshot(input.history.rows);
  const result = await planNoticeReply(input);
  assert.equal(result.status, 'review');
  assert.equal(result.text, undefined);
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
