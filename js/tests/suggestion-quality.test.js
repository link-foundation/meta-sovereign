import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usefulSuggestion } from '../src/replies/suggestion-quality.js';
import { mergeSuggestions } from '../src/replies/reply-cache.js';

test('word predictions must save at least three letters of typing', () => {
  for (const insert of [' И', ' Я', ' А', ' да', 'no', 't', ' 🙂', 'a!!']) {
    assert.equal(usefulSuggestion({ kind: 'word', insert }), false, insert);
  }
  assert.equal(
    usefulSuggestion({ kind: 'word', word: 'Привет', insert: 'ет' }),
    false
  );
  for (const insert of ['ивет', ' пожалуйста', ' thanks', '123']) {
    assert.equal(usefulSuggestion({ kind: 'word', insert }), true, insert);
  }
  assert.equal(usefulSuggestion({ kind: 'reply', text: 'Да' }), true);
});

test('the shared merger filters old server predictions as well as browser results', () => {
  const local = {
    suggestions: [{ kind: 'word', text: 'Привет И', insert: ' И' }],
  };
  const remote = {
    suggestions: [
      { kind: 'word', text: 'Привет Я', insert: ' Я' },
      { kind: 'word', text: 'Привет всем', word: 'всем', insert: ' всем' },
      { kind: 'reply', text: 'Да' },
    ],
  };
  assert.deepEqual(
    mergeSuggestions(local, remote, { typed: 'Привет ' }).suggestions.map(
      (s) => s.text
    ),
    ['Да', 'Привет всем']
  );
  assert.deepEqual(
    mergeSuggestions(local, remote, { typed: 'Привет?' }).suggestions.map(
      (s) => s.text
    ),
    ['Да']
  );
});
