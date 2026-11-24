import test from 'node:test';
import assert from 'node:assert/strict';
import {
  browserTextDraft,
  saveBrowserTextDraft,
} from '../src/web/question-browser-text-state.js';

const review = {
  id: 'review-one',
  target: { source: 'hh' },
  chat: '7',
  plan: { complete: true, text: 'Planned answer' },
};
const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
};

test('reviewed text retains exact edits and intentional empty drafts only for that review', () => {
  const storage = memory();
  assert.equal(browserTextDraft(review, storage), 'Planned answer');
  saveBrowserTextDraft(
    review,
    'Salary and experience\nReviewed together',
    storage
  );
  assert.equal(
    browserTextDraft(globalThis.structuredClone(review), storage),
    'Salary and experience\nReviewed together'
  );
  assert.equal(
    browserTextDraft({ ...review, id: 'new-question' }, storage),
    'Planned answer'
  );
  assert.equal(
    browserTextDraft({ ...review, chat: '8' }, storage),
    'Planned answer'
  );
  assert.equal(
    browserTextDraft({ ...review, target: { source: 'vk' } }, storage),
    'Planned answer'
  );
  saveBrowserTextDraft(review, '', storage);
  assert.equal(browserTextDraft(review, storage), '');
  saveBrowserTextDraft(review, 'x'.repeat(12000), storage);
  saveBrowserTextDraft(review, 'x'.repeat(12001), storage);
  assert.equal(browserTextDraft(review, storage).length, 12000);
  assert.equal(storage.values.size, 1);
});

test('unavailable or corrupt draft storage preserves bounded complete suggestions without truncation', () => {
  for (const storage of [
    null,
    {
      getItem() {
        throw new Error('Denied');
      },
    },
    { getItem: () => '{' },
    { getItem: () => ' '.repeat(80001) },
    { getItem: () => JSON.stringify({ id: review.id, text: 1 }) },
  ]) {
    assert.equal(browserTextDraft(review, storage), 'Planned answer');
    assert.equal(
      browserTextDraft(
        { ...review, plan: { complete: false, text: 'Partial answer' } },
        storage
      ),
      ''
    );
    assert.equal(
      browserTextDraft(
        { ...review, plan: { complete: true, text: 'x'.repeat(12001) } },
        storage
      ),
      ''
    );
    assert.doesNotThrow(() =>
      saveBrowserTextDraft(review, 'Keep editing', storage)
    );
  }
  assert.doesNotThrow(() =>
    saveBrowserTextDraft(review, 'Keep editing', {
      setItem() {
        throw new Error('Quota');
      },
    })
  );
});

test('the server submitted text takes precedence over local edits and plans', () => {
  const storage = memory();
  saveBrowserTextDraft(review, 'Later local change', storage);
  const submitted = {
    ...review,
    status: 'unknown',
    outbox: { answerType: 'text', text: 'Actual submitted reply' },
  };
  assert.equal(browserTextDraft(submitted, storage), 'Actual submitted reply');
  for (const text of [null, 5, 'x'.repeat(12001)]) {
    assert.equal(
      browserTextDraft(
        { ...submitted, outbox: { answerType: 'text', text } },
        storage
      ),
      ''
    );
  }
});

test('editing after a definite refusal survives reload while uncertain text stays immutable', () => {
  const storage = memory();
  const refused = {
    ...review,
    status: 'failed',
    outbox: { answerType: 'text', text: 'Refused earlier reply' },
  };
  assert.equal(browserTextDraft(refused, storage), 'Refused earlier reply');
  saveBrowserTextDraft(refused, 'Edited after refusal', storage);
  assert.equal(browserTextDraft(refused, storage), 'Edited after refusal');
  for (const status of ['sending', 'sent', 'unknown']) {
    assert.equal(
      browserTextDraft({ ...refused, status }, storage),
      'Refused earlier reply'
    );
  }
});
