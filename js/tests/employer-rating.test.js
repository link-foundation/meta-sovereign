import test from 'node:test';
import assert from 'node:assert/strict';
import {
  employerRatingDestination,
  seedEmployerRating,
} from '../src/forms/employer-rating.js';
import { unreadFormLink } from '../src/automation/question-unread-form.js';
import { createLinkedFormPrefill } from '../src/forms/linked-prefill.js';
import { createFormReader } from '../src/forms/reader.js';
import { createFormSessions } from '../src/forms/review-sessions.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { reviewBrowser } from './helpers/forms-session-fixture.mjs';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import { checkUnreadReview } from '../src/automation/question-unread-state.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import {
  questionBrowserCli,
  questionBrowserHttp,
} from '../../experiments/issue-56/question-browser-clients.mjs';

const url = 'https://rating.hh.ru/poll';
const company = 'Example employer';
const nativeChat = 'https://hh.ru/chat/8';
const message = { id: '807', links: [url], body: 'Please rate our company.' };
const conversation = {
  question: message,
  pendingTurn: { messages: [message] },
  noticeContext: { company, canReply: true },
};

test('only the exact HeadHunter poll and native employer context qualify', () => {
  for (const destination of [
    'http://rating.hh.ru/poll',
    'https://rating.hh.ru/poll/other',
    'https://rating.hh.ru/%70oll',
    'https://rating.hh.ru:443/poll',
    'https://rating.hh.ru/poll?next=other',
    'https://rating.hh.ru@other.test/poll',
  ]) {
    assert.equal(employerRatingDestination(destination), null);
  }
  assert.equal(employerRatingDestination(`${url}/`), url);
  assert.deepEqual(unreadFormLink(true, conversation, 'hh'), {
    url,
    messageId: message.id,
  });
  assert.equal(unreadFormLink(true, conversation, 'telegram'), null);
  assert.equal(unreadFormLink(false, conversation, 'hh'), null);
  assert.equal(
    unreadFormLink(true, { ...conversation, hasDraft: true }, 'hh'),
    null
  );
  assert.equal(
    unreadFormLink(true, { ...conversation, noticeContext: undefined }, 'hh'),
    null
  );
});

test('session transfer preserves secure provider scope and refuses a changed native chat', async () => {
  const scoped = { name: 'fixture', domain: '.hh.ru', path: '/', secure: true };
  let current = nativeChat;
  const sent = [];
  const original = {
    cookies: async (scope) => {
      assert.equal(scope, 'https://hh.ru');
      return [
        scoped,
        { ...scoped, domain: 'hh.ru.other.test' },
        { ...scoped, secure: false },
        { ...scoped, domain: 'rating.hh.ru' },
      ];
    },
  };
  const source = { url: () => current, context: () => original };
  const receiving = { addCookies: async (cookies) => sent.push(cookies) };
  const destination = { url: () => 'about:blank', context: () => receiving };
  assert.equal(
    await seedEmployerRating(source, destination, async () => {}),
    true
  );
  assert.deepEqual(sent, [[scoped]]);
  assert.equal(
    await seedEmployerRating(source, destination, async () => {
      current = 'https://hh.ru/chat/9';
    }),
    false
  );
  assert.equal(sent.length, 1);
  assert.equal(
    await seedEmployerRating(
      source,
      { ...destination, context: () => original },
      async () => assert.fail('do not borrow the source context')
    ),
    false
  );
});

const ratingInput = (overrides = {}) => ({
  url,
  source: 'hh',
  chat: '8',
  messageId: '807',
  verify: async () => {},
  signal: new AbortController().signal,
  rating: { company, seed: async () => true },
  ...overrides,
});

const ratingRow = (body = message.body) => {
  const pending = { ...message, body };
  return {
    strictOptions: false,
    question: { ...pending, outgoing: false },
    pendingTurn: { boundary: { kind: 'rendered-start' }, messages: [pending] },
    noticeContext: { canReply: true },
  };
};

const ratingBrowser = (browser, result, evaluations = []) => ({
  ...browser,
  page: {
    ...browser.page,
    evaluate: async (fn, request) => {
      if (request?.company === company) {
        evaluations.push(request);
        return result;
      }
      return browser.page.evaluate(fn, request);
    },
  },
});

test('the linked rating owns a single review and shares the Forms capacity', async () => {
  const store = createMemoryStore();
  const browser = reviewBrowser();
  const evaluations = [];
  const forms = createFormReader({
    store,
    review: { maxSessions: 1 },
    async openSession(options) {
      assert.equal(options.headless, undefined);
      return ratingBrowser(browser, 'rating-ready', evaluations);
    },
  });
  const linked = createLinkedFormPrefill({ store, forms });
  try {
    const receipt = await linked(ratingInput());
    assert.equal(receipt.state, 'rating-ready');
    assert.equal(receipt.written, 0);
    assert.deepEqual(
      evaluations.map(({ write }) => write),
      [true, false]
    );
    assert.deepEqual(await linked(ratingInput()), receipt);
    const { sessions } = forms.listReviews();
    assert.equal(sessions[0].kind, 'employer-rating');
    assert.equal(sessions[0].answerLearning.enabled, false);
    await assert.rejects(forms.readReview(receipt.sessionId), {
      code: 'form-rating-owner-only',
    });
    await assert.rejects(forms.planReview({ id: receipt.sessionId }), {
      code: 'form-rating-owner-only',
    });
    assert.equal(
      (await linked(ratingInput({ messageId: '808' }))).code,
      'form-session-limit'
    );
    await forms.closeReview(receipt.sessionId);
    assert.equal((await linked(ratingInput())).state, 'unconfirmed');
  } finally {
    await forms.stop();
  }
});

for (const [wire, result, body] of [
  [LINO_TEXT, 'rating-closed', message.body],
  [LINO_BINARY, 'rating-sign-in', message.body],
  [
    LINO_BINARY,
    'rating-ready',
    'Please rate our company. Can you start Monday?',
  ],
]) {
  test(
    `${wire} keeps the native chat held for ${result} or a separate question`,
    { timeout: 10000 },
    async () => {
      const env = await unreadAnswerFixture({
        rows: [ratingRow(body), { strictOptions: false }],
        seedRating: async () => result !== 'rating-sign-in',
      });
      const { server, call } = await questionBrowserHttp({
        ...env,
        forms: {
          openSession: async () => ratingBrowser(reviewBrowser(), result),
        },
      });
      try {
        const { id } = env.input;
        const start = await call(
          'unread-start',
          { ...env.input, prefillForms: true },
          wire
        );
        assert.equal(start.status, 200);
        let receipt;
        for (let i = 0; i < 50; i++) {
          receipt = checkUnreadReview(
            (await call('unread-status', { id }, wire)).body,
            id
          );
          if (receipt.state !== 'active') {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(receipt.entries.length, 1);
        assert.equal(receipt.entries[0].form.state, result);
        assert.equal(receipt.entries[0].form.written, 0);
        assert.equal(receipt.restoration.heldReview.chat, '8');
        assert.deepEqual(env.state.sends, []);
      } finally {
        await server.close();
        await env.browser.close();
      }
    }
  );
}

test(
  'the foreground CLI reports the ready poll and holds the next conversation',
  { timeout: 10000 },
  async () => {
    const env = await unreadAnswerFixture({
      rows: [
        ratingRow('Please rate our company. HeadHunter'),
        { strictOptions: false },
      ],
      seedRating: async () => true,
    });
    try {
      const cli = questionBrowserCli({
        ...env,
        forms: {
          openSession: async () =>
            ratingBrowser(reviewBrowser(), 'rating-ready'),
        },
      });
      const result = await cli('unread', {
        source: 'hh',
        confirm: true,
        'pass-id': env.input.id,
        'answer-chats': true,
        'prefill-forms': true,
      });
      assert.equal(result.code, 0);
      assert.equal(result.value.entries[0].form.state, 'rating-ready');
      assert.equal(result.value.entries[0].answer.phase, 'form-review');
      assert.equal(result.value.restoration.heldReview.chat, '9');
      assert.deepEqual(env.state.sends, []);
    } finally {
      await env.browser.close();
    }
  }
);

test('a foreign poll redirect closes the review before the search can run', async () => {
  const store = createMemoryStore();
  const browser = reviewBrowser();
  const forms = createFormReader({
    store,
    openSession: async () => ({
      ...browser,
      commander: {
        ...browser.commander,
        goto: async () => browser.navigate('https://example.test/poll'),
      },
    }),
  });
  try {
    const receipt = await createLinkedFormPrefill({ store, forms })(
      ratingInput()
    );
    assert.equal(receipt.state, 'refused');
    assert.equal(receipt.code, 'question-form-destination');
    assert.deepEqual(forms.listReviews().sessions, []);
  } finally {
    await forms.stop();
  }
});

test('foreground detachment leaves the headed poll with its browser idle owner', async () => {
  const store = createMemoryStore();
  store.logFile = '/tmp/fixture-rating/log.lino';
  const browser = reviewBrowser();
  let detached = 0;
  const reviews = createFormSessions({
    store,
    async openSession(options) {
      assert.equal(options.persistent, true);
      assert.equal(options.headless, undefined);
      assert.ok(options.idleMs > 0);
      return {
        ...ratingBrowser(browser, 'rating-ready'),
        detach: async () => detached++,
      };
    },
  });
  const { session } = await reviews.openRating({
    url,
    company,
    seed: async () => true,
    verify: async () => {},
  });
  assert.equal((await reviews.detach()).sessions[0].id, session.id);
  assert.equal(detached, 1);
  assert.deepEqual(reviews.list().sessions, []);
  assert.equal(
    browser.calls.some(([name]) => name === 'close'),
    false
  );
});
