import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ProgressBar,
  transferPercent,
  countPercent,
} from '../src/web/progress-bar.js';
import { percentOf } from '../src/web/chat-export.js';
import { chatsPercent } from '../src/web/chat-account-data.js';
import { progressOf } from '../src/web/chat-boosts.js';
import { Poll } from '../src/web/chat-poll.js';

test('transfer percentage uses one precise, bounded value without premature completion', () => {
  for (const [fraction, expected] of [
    [0, 0],
    [0.29, 29],
    [0.687, 68],
    [0.99999999999, 99],
    [1, 100],
    [2, 100],
    [-0.2, 0],
  ]) {
    assert.equal(transferPercent(fraction), expected);
  }
  for (const fraction of [null, undefined, NaN, Infinity, '0.68', true]) {
    assert.equal(transferPercent(fraction), null);
  }
});

test('upload, export and boost meters keep their width and accessibility value equal', () => {
  const values = [
    transferPercent(0.687),
    percentOf({ messages: 2, total: 3 }),
    chatsPercent({ chatsDone: 1, chatsTotal: 4 }),
    progressOf({ boosts: 2, currentLevelBoosts: 1, nextLevelBoosts: 4 })
      .percent,
  ];
  for (const percent of values) {
    const html = renderToStaticMarkup(
      React.createElement(ProgressBar, { percent, label: 'Progress' })
    );
    assert(html.includes(`aria-valuenow="${percent}"`));
    assert(html.includes(`width:${percent}%`));
  }
});

test('unknown progress has no invented percentage and malformed counts never create invalid widths', () => {
  for (const percent of [null, undefined, NaN, Infinity]) {
    const html = renderToStaticMarkup(
      React.createElement(ProgressBar, { percent, label: 'Working' })
    );
    assert(html.includes('data-progress="indeterminate"'));
    assert(!html.includes('aria-valuenow'));
    assert(!html.includes('width:'));
  }
  assert.equal(countPercent(-2, 10), 0);
  assert.equal(countPercent(20, 10), 100);
  assert.equal(countPercent(1, 0), null);
  assert.equal(countPercent(NaN, 10), null);
});

test('zero-percent poll results do not paint a nonzero share', () => {
  const html = renderToStaticMarkup(
    React.createElement(Poll, {
      api: {},
      media: {
        id: 'fixture',
        closed: true,
        question: 'Fixture?',
        total: 2,
        recentVoters: [],
        answers: [
          { option: 'a', text: 'None', voters: 0 },
          { option: 'b', text: 'All', voters: 2 },
        ],
      },
    })
  );
  assert(html.includes('>0%</'));
  assert(html.includes('class="poll-bar" style="width:0%"'));
  assert(html.includes('class="poll-bar" style="width:100%"'));
});
