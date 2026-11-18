import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrowserPendingTurn } from '../src/web/question-browser-pending.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { createChoiceContext } from '../src/sources/browser-choice-controller.js';
import {
  browserChoiceDraft,
  checkBrowserQuestion,
} from '../src/automation/question-browser-state.js';
import { pendingSnapshot } from '../../experiments/issue-56/pending-turn-fixture.mjs';
import { withHistory } from '../../experiments/issue-56/browser-history-fixture.mjs';
import {
  questionBrowserFixture,
  browserTarget,
} from '../../experiments/issue-56/question-browser-fixture.mjs';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';

const guarded = (expected, current = expected) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  });
  try {
    return createChoiceContext({ expected }, () => current).same(current);
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'window', previous);
    } else {
      delete globalThis.window;
    }
  }
};

test('browser review and native draft retain detached complete rendered pending messages', () => {
  const original = pendingSnapshot();
  const snapshot = checkBrowserQuestion(original);
  assert.deepEqual(snapshot.pendingTurn, original.pendingTurn);
  original.pendingTurn.messages[0].body = 'Mutated after inspection';
  assert.equal(
    snapshot.pendingTurn.messages[0].body,
    'What is your expected salary?'
  );
  const draft = browserChoiceDraft(
    { target: { source: 'hh' }, snapshot },
    'Yes'
  );
  assert.deepEqual(draft.answer.pendingTurn, snapshot.pendingTurn);
});

test('an earlier pending edit or manual reply invalidates an unchanged latest question', () => {
  const expected = pendingSnapshot();
  assert.equal(guarded(expected), true);
  const changed = globalThis.structuredClone(expected);
  changed.pendingTurn.messages[0].body = 'When can you start?';
  assert.equal(guarded(expected, changed), false);
  changed.pendingTurn = {
    boundary: { kind: 'outgoing', id: '100a', body: 'I answered manually' },
    messages: [{ id: '101', body: expected.question.body }],
  };
  assert.equal(guarded(expected, changed), false);
});

test('legacy latest-only intent cannot consume additional pending incoming messages', () => {
  const current = pendingSnapshot();
  const expected = { ...current };
  delete expected.pendingTurn;
  assert.equal(guarded(expected, current), false);
  current.pendingTurn.messages.shift();
  assert.equal(guarded(expected, current), true);
});

test('malformed, incomplete and over-capacity pending evidence is refused', () => {
  const changes = [
    (turn) => {
      turn.messages[0].body = '';
    },
    (turn) => {
      turn.messages[0].id = '101';
    },
    (turn) => {
      turn.messages.at(-1).body = 'Another question';
    },
    (turn) => {
      turn.boundary.kind = 'provider-complete';
    },
    (turn) => {
      turn.messages = Array.from({ length: 21 }, (_, i) => ({
        id: String(i),
        body: 'Pending',
      }));
    },
    (turn) => {
      turn.messages[0].body = 'x'.repeat(6001);
    },
  ];
  for (const change of changes) {
    const snapshot = pendingSnapshot();
    change(snapshot.pendingTurn);
    assert.throws(() => checkBrowserQuestion(snapshot), {
      code: 'question-browser-unverified',
    });
  }
});

test('the serialized provider reader retains every incoming message after an actual boundary', () => {
  for (const boundary of [
    { outgoing: true, body: 'My reply' },
    { title: 'Vacancy application' },
  ]) {
    withHistory(
      [
        { body: 'An old answered question?' },
        boundary,
        { body: 'What is your salary?' },
        { body: 'We will review your application.' },
      ],
      (read) => {
        const value = read('read');
        assert.equal(
          value.pendingTurn.boundary.kind,
          boundary.outgoing ? 'outgoing' : 'service'
        );
        assert.equal(value.pendingTurn.boundary.id, '2');
        assert.deepEqual(
          value.pendingTurn.messages.map((row) => row.id),
          ['3', '4']
        );
        assert.deepEqual(
          checkBrowserQuestion(value).pendingTurn,
          value.pendingTurn
        );
      }
    );
  }
  withHistory([{ body: 'First rendered question?' }], (read) => {
    assert.deepEqual(read('read').pendingTurn.boundary, {
      kind: 'rendered-start',
    });
  });
});

test('rendered history capacity and blank pending rows never become a partial action snapshot', () => {
  const cases = [
    [{ body: '' }, { body: 'Latest question?' }],
    Array.from({ length: 21 }, () => ({ body: 'A question?' })),
    Array.from({ length: 5 }, () => ({ body: 'x'.repeat(5000) })),
  ];
  for (const rows of cases) {
    withHistory(rows, (read) => {
      assert.match(read('read').code, /^answer-history-(limited|unverified)$/u);
      assert.equal(read('history').messages.length, rows.length);
    });
  }
});

test('stored review recovery and selection carry the frozen pending evidence without re-reading', async () => {
  const env = await questionBrowserFixture();
  try {
    env.state.snapshot = pendingSnapshot();
    const review = await env.browser.inspect(browserTarget);
    const frozen = globalThis.structuredClone(review.pendingTurn);
    review.pendingTurn.messages[0].body = 'Caller mutation';
    assert.deepEqual((await env.browser.status(review)).pendingTurn, frozen);
    await env.browser.select({ id: review.id, option: 'Yes', confirm: true });
    assert.deepEqual(env.state.sends[0].answer.pendingTurn, frozen);
    assert.equal(env.state.reads.length, 1);
  } finally {
    await env.browser.close();
  }
});

test('finite automatic watches retain multiple pending messages for review without prefilling or selecting', async () => {
  const env = await questionWatchFixture();
  try {
    env.state.snapshot = pendingSnapshot();
    const review = await env.browser.inspect(browserTarget);
    env.input.review = review.id;
    await env.browser.watchStart(env.input);
    const status = await env.until((state) => state.phase === 'review');
    assert.deepEqual(status.last.snapshot.pendingTurn, review.pendingTurn);
    assert.equal(env.state.sends.length, 0);
    assert.equal(env.state.prefills.length, 0);
    await env.browser.watchStop(env.input);
  } finally {
    await env.browser.close();
  }
});

test('all four languages show every pending message, latest-answer scope and unknown earlier coverage', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const snapshot = pendingSnapshot();
    snapshot.pendingTurn.messages[0].body =
      '<script>Pending question?</script>';
    const render = (value) =>
      renderToStaticMarkup(
        React.createElement(
          LocaleContext.Provider,
          { value: { t: (key, vars) => translate(locale, key, vars) } },
          React.createElement(BrowserPendingTurn, { snapshot: value })
        )
      );
    const markup = render(snapshot);
    assert.match(markup, /&lt;script&gt;Pending question\?&lt;\/script&gt;/u);
    assert.ok(markup.includes(snapshot.question.body));
    assert.ok(markup.includes(translate(locale, 'browserAnswer.latestOnly')));
    assert.ok(
      markup.includes(translate(locale, 'browserAnswer.boundary.outgoing'))
    );
    delete snapshot.pendingTurn;
    assert.ok(
      render(snapshot).includes(
        translate(locale, 'browserAnswer.boundary.unknown')
      )
    );
  }
});
