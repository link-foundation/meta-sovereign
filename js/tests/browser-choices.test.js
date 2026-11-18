import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultSender,
  createBrowserSender,
} from '../src/sources/browser-sender.js';
import {
  selectBrowserAnswer,
  prefillBrowserAnswer,
  enrichBrowserChoices,
} from '../src/sources/browser-choices.js';
import {
  providerChoiceDraft,
  providerChoiceUi,
} from '../../experiments/issue-56/provider-choice-fixture.mjs';

test('strict default sends use only the verified choice operation', async () => {
  const writes = [];
  const draft = providerChoiceDraft();
  const send = createDefaultSender({
    getSource: () => ({
      live: {
        post: () => {
          writes.push('api');
        },
      },
    }),
    browser: {
      send: () => writes.push('text'),
      chooseAnswer: (value) => {
        writes.push(value);
        return { messageId: '102' };
      },
      close() {},
    },
  });
  assert.deepEqual(await send(draft), { messageId: '102' });
  assert.deepEqual(writes, [draft]);
  await send.close();
});

test('the direct browser sender refuses unsupported strict choices before opening a session', async () => {
  let opened = 0;
  const browser = createBrowserSender({
    openSession: async () => {
      opened++;
      throw new Error('Unexpected launch');
    },
  });
  await assert.rejects(
    browser.send({ ...providerChoiceDraft(), source: 'vk' }),
    { code: 'answer-choice-required' }
  );
  assert.equal(opened, 0);
  await browser.close();
});

test('a changed history snapshot cannot shed its strict option metadata', async () => {
  const ui = providerChoiceUi('http://127.0.0.1:12345');
  const commander = {
    evaluate: async () => ({
      chat: '7',
      question: { id: '202', body: 'A new question?' },
      strictOptions: true,
      answerOptions: ['Yes.', 'No.'],
    }),
  };
  await assert.rejects(
    enrichBrowserChoices(commander, ui, '7', [
      { id: '101', body: 'Old question?' },
    ]),
    { code: 'answer-choice-changed' }
  );
});

test('unsupported strict providers never fall back to ordinary sends', async () => {
  let writes = 0;
  const send = createDefaultSender({
    getSource: () => ({ live: { post: () => writes++ } }),
    browser: { send: () => writes++, close() {} },
  });
  assert.throws(() => send(providerChoiceDraft()), {
    code: 'answer-choice-required',
  });
  assert.equal(writes, 0);
  await send.close();
});

test('a single frozen latest question and exact option intent are required before page access', async () => {
  const commander = {
    evaluate: () => {
      throw new Error('unexpected page access');
    },
  };
  const ui = providerChoiceUi('http://127.0.0.1:12345');
  const mutations = [
    (draft) => {
      delete draft.answer.turn;
    },
    (draft) => {
      draft.answer.turn.messages.push(draft.answer.turn.messages[0]);
    },
    (draft) => {
      draft.answer.turn.messages[0].id = 'msg:hh:8:101';
    },
    (draft) => {
      draft.answer.option = 'No.';
    },
    (draft) => {
      draft.answer.turn.messages[0].options = '[null]';
    },
    (draft) => {
      draft.answer.turn.messages[0].body = null;
    },
  ];
  for (const mutate of mutations) {
    const draft = providerChoiceDraft();
    mutate(draft);
    await assert.rejects(selectBrowserAnswer(commander, ui, draft, '7'), {
      code: 'answer-choice-required',
    });
  }
});

test('receipt waits are finite and explicit choice instructions cannot be text-prefilled', async () => {
  const commander = {
    evaluate: () => {
      throw new Error('unexpected page access');
    },
  };
  const ui = providerChoiceUi('http://127.0.0.1:12345');
  for (const receiptMs of [-1, Infinity, 30001, NaN]) {
    await assert.rejects(
      selectBrowserAnswer(commander, ui, providerChoiceDraft(), '7', {
        receiptMs,
      }),
      { code: 'bad-draft' }
    );
  }
  await assert.rejects(
    prefillBrowserAnswer(
      commander,
      ui,
      {
        question: { body: 'Choose one option' },
        answerOptions: [],
      },
      'Yes.'
    ),
    { code: 'bad-draft' }
  );
});
