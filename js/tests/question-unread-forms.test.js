import test from 'node:test';
import assert from 'node:assert/strict';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import { checkUnreadReview } from '../src/automation/question-unread-state.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  respondentDestination,
  sameRespondentForm,
} from '../src/forms/form-destination.js';
import { createLinkedFormPrefill } from '../src/forms/linked-prefill.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import {
  questionBrowserCli,
  questionBrowserHttp,
} from '../../experiments/issue-56/question-browser-clients.mjs';

const url = 'https://forms.gle/ExampleForm1';
const linkedRow = (body = 'Пожалуйста, заполните анкету.', links = [url]) => {
  const message = { id: '101', body, links };
  return {
    strictOptions: false,
    question: { ...message, outgoing: false },
    pendingTurn: { boundary: { kind: 'rendered-start' }, messages: [message] },
  };
};

const refusedBrowser = (slots) => ({
  async openSession({ slot }) {
    slots.push(slot);
    throw Object.assign(new Error('Fixture browser unavailable.'), {
      code: 'browser-unavailable',
    });
  },
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `the unread form intent and held receipt traverse ${type}`,
    { timeout: 10000 },
    async () => {
      const env = await unreadAnswerFixture({ rows: [linkedRow()] });
      const slots = [];
      const { server, call } = await questionBrowserHttp({
        ...env,
        forms: refusedBrowser(slots),
      });
      try {
        assert.deepEqual(
          (await call(undefined, undefined, type)).body.unreadFormSources.map(
            ({ id }) => id
          ),
          ['hh']
        );
        const id = env.input.id;
        const { status } = await call(
          'unread-start',
          {
            ...env.input,
            prefillForms: true,
            ...(type === LINO_BINARY ? { budgetMs: 45000 } : {}),
          },
          type
        );
        assert.equal(status, 200);
        let result;
        for (let i = 0; i < 50; i++) {
          result = checkUnreadReview(
            (await call('unread-status', { id }, type)).body,
            id
          );
          if (result.state !== 'active') {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(result.state, 'completed');
        assert.equal(
          result.settings.budgetMs,
          type === LINO_BINARY ? 45000 : 60000
        );
        assert.equal(result.restoration.heldReview.chat, '8');
        assert.equal(result.entries[0].form.code, 'browser-unavailable');
        assert.equal(slots.length, 1);
      } finally {
        await server.close();
        await env.browser.close();
      }
    }
  );
}

test(
  'the registered CLI admits a linked form only with explicit sequential chat processing',
  { timeout: 10000 },
  async () => {
    const env = await unreadAnswerFixture({ rows: [linkedRow()] });
    const slots = [];
    const cli = questionBrowserCli({ ...env, forms: refusedBrowser(slots) });
    const options = { source: 'hh', confirm: true, 'pass-id': env.input.id };
    try {
      assert.equal(
        (await cli('unread', { ...options, 'prefill-forms': 'invalid' })).code,
        1
      );
      assert.equal(
        (await cli('unread', { ...options, 'prefill-forms': true })).code,
        1
      );
      assert.deepEqual(slots, []);
      const result = await cli('unread', {
        ...options,
        'prefill-forms': true,
        'answer-chats': true,
      });
      assert.equal(result.code, 0);
      assert.equal(result.value.entries[0].form.state, 'refused');
      assert.equal(result.value.restoration.heldReview.chat, '8');
      assert.equal(slots.length, 1);
    } finally {
      await env.browser.close();
    }
  }
);

const withPass = async (options, work) => {
  const calls = [];
  const env = await unreadAnswerFixture({
    rows: [linkedRow(), { strictOptions: false }],
    prefillLinkedForm: async ({ verify, ...input }) => {
      await verify();
      calls.push(input);
      return {
        url: input.url,
        state: 'prefilled',
        messageId: input.messageId,
        sessionId: 'aa38c34e-ac08-449c-b3b0-1a69a632a05c',
        browserSlot: 'chat-form-1',
        written: 2,
      };
    },
    ...options,
  });
  try {
    await work(env, calls);
  } finally {
    await env.browser.close();
  }
};

test('an opted-in questionnaire opens Forms and continues the unread pass', () =>
  withPass({}, async (env, calls) => {
    const result = await env.complete({ ...env.input, prefillForms: true });
    assert.deepEqual(
      result.entries.map(({ chat }) => chat),
      ['8', '9']
    );
    assert.equal(result.entries[0].answer.phase, 'form-review');
    assert.equal(result.entries[0].form.written, 2);
    assert.deepEqual(
      calls.map(({ source, chat, messageId, url: target }) => [
        source,
        chat,
        messageId,
        target,
      ]),
      [['hh', '8', '101', url]]
    );
    checkUnreadReview(result, env.input.id);
    assert.deepEqual(env.state.sends, []);
  }));

test('a form alongside an unanswered question still holds the native chat', () =>
  withPass(
    { rows: [linkedRow('Please fill in the form. Can you start Monday?'), {}] },
    async (env, calls) => {
      const result = await env.complete({ ...env.input, prefillForms: true });
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].form.state, 'prefilled');
      assert.equal(result.restoration.heldReview.chat, '8');
      assert.equal(calls.length, 1);
      assert.deepEqual(env.state.prefills, []);
    }
  ));

test('a changed native link leaves the chat for review without acquiring a form', () =>
  withPass(
    {
      readCurrent: (snapshot) => ({
        ...snapshot,
        ...linkedRow('Пожалуйста, заполните анкету.', [
          'https://forms.gle/Replacement2',
        ]),
      }),
    },
    async (env, calls) => {
      const result = await env.complete({ ...env.input, prefillForms: true });
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].form.code, 'question-form-changed');
      assert.equal(result.restoration.heldReview.chat, '8');
      assert.equal(calls.length, 0);
    }
  ));

test('an ordinary unread review and a pass without form support issue no form work', () =>
  withPass({ prefillLinkedForm: undefined }, async (env) => {
    await assert.rejects(
      env.browser.unreadStart({ ...env.input, prefillForms: true }),
      {
        code: 'question-unread-forms-unavailable',
      }
    );
    const result = await env.complete();
    assert.equal(result.entries[0].form, undefined);
    assert.equal(result.restoration.heldReview.chat, '8');
  }));

test('only official respondent paths are eligible and redirected form identities stay bound', () => {
  for (const destination of [
    'https://forms.gle/AbC1',
    'https://docs.google.com/forms/d/e/AbC1/viewform',
    'https://forms.yandex.ru/cloud/u/AbC1/',
    'https://forms.yandex.com/u/AbC1/',
    'https://forms.office.com/r/AbC1',
    'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=AbC1',
    'https://candidate.typeform.com/to/AbC1',
  ]) {
    assert.equal(respondentDestination(destination)?.url, destination);
  }
  for (const destination of [
    'https://forms.gle.example.test/AbC1',
    'http://forms.gle/AbC1',
    'https://forms.gle@attacker.test/AbC1',
    'https://docs.google.com/forms/d/AbC1/edit',
    'https://forms.yandex.ru/admin/AbC1/',
    'https://forms.office.com/Pages/DesignPage.aspx?id=AbC1',
    'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=Good&ID=Other',
    'https://candidate.typeform.com/forms/AbC1/create',
  ]) {
    assert.equal(respondentDestination(destination), null);
  }
  const pairs = [
    [
      true,
      'https://forms.gle/AbC1',
      'https://docs.google.com/forms/d/e/ActualForm/viewform',
    ],
    [false, 'https://forms.gle/AbC1', 'https://forms.yandex.ru/u/AbC1/'],
    [
      false,
      'https://docs.google.com/forms/d/AbC1/viewform',
      'https://docs.google.com/forms/d/e/AbC1/viewform',
    ],
    [
      false,
      'https://candidate.typeform.com/to/AbC1',
      'https://unrelated.typeform.com/to/AbC1',
    ],
  ];
  for (const [expected, from, to] of pairs) {
    assert.equal(
      sameRespondentForm(
        respondentDestination(from),
        respondentDestination(to)
      ),
      expected
    );
  }
});

test('a linked questionnaire keeps a single durable reservation and a closed receipt', async () => {
  const store = createMemoryStore();
  const url = 'https://candidate.typeform.com/to/Fixture';
  const session = {
    id: 'aa38c34e-ac08-449c-b3b0-1a69a632a05c',
    browserSlot: 'chat-form-test',
  };
  const sessions = [];
  const opened = [];
  const forms = {
    listReviews: () => ({ sessions }),
    async openReview(input) {
      opened.push(input);
      sessions.push(session);
      return { session };
    },
    async prefillReview(input, _waiting, validate) {
      assert.equal(input.profileId, 'profile:stored');
      validate({ url, frames: [] });
      return {
        ok: true,
        state: 'prefilled',
        receipts: [{ status: 'applied' }],
      };
    },
  };
  const input = {
    source: 'hh',
    chat: '8',
    messageId: '101',
    url,
    planning: { profileId: 'profile:stored' },
    signal: new AbortController().signal,
    verify: () => {},
  };
  const prefill = createLinkedFormPrefill({ store, forms });
  try {
    const receipts = await Promise.all([prefill(input), prefill(input)]);
    assert.equal(opened.length, 1);
    assert.ok(
      receipts.some(
        (value) => value.state === 'prefilled' && value.written === 1
      )
    );
    assert.match(opened[0].browserSlot, /^chat-form-[a-f\d]{20}$/u);
    sessions.length = 0;
    const recovered = await createLinkedFormPrefill({ store, forms })(input);
    assert.deepEqual(recovered, {
      url,
      messageId: '101',
      state: 'closed',
      written: 1,
    });
    assert.equal(opened.length, 1);
  } finally {
    await store.close?.();
  }
});

test('a full slot pool allows a new attempt and an unrelated frame prevents planning', async () => {
  const store = createMemoryStore();
  const url = 'https://candidate.typeform.com/to/Fixture';
  const session = {
    id: 'aa38c34e-ac08-449c-b3b0-1a69a632a05c',
    browserSlot: 'chat-form-test',
  };
  const attempts = [];
  const forms = {
    async openReview() {
      attempts.push('open');
      if (attempts.length === 1) {
        throw Object.assign(new Error('Capacity reached'), {
          code: 'form-session-limit',
        });
      }
      return { session };
    },
    async prefillReview(_input, _waiting, validate) {
      assert.throws(
        () =>
          validate({
            url,
            frames: [{ url: 'https://other.test', fieldCount: 1 }],
          }),
        {
          code: 'question-form-destination',
        }
      );
      return {
        ok: false,
        state: 'refused',
        code: 'question-form-destination',
        receipts: [],
      };
    },
    async closeReview(id) {
      attempts.push(id);
    },
  };
  const input = {
    source: 'hh',
    chat: '8',
    messageId: '101',
    url,
    planning: {},
    signal: new AbortController().signal,
    verify: () => {},
  };
  const prefill = createLinkedFormPrefill({ store, forms });
  try {
    assert.equal((await prefill(input)).code, 'form-session-limit');
    assert.deepEqual(await prefill(input), {
      url,
      messageId: '101',
      state: 'refused',
      written: 0,
      code: 'question-form-destination',
    });
    assert.deepEqual(attempts, ['open', 'open', session.id]);
  } finally {
    await store.close?.();
  }
});
