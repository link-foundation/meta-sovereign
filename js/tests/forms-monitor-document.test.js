import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { observeFormDocument } from '../src/forms/monitor-document.js';
import { FormMonitorStatus } from '../src/web/form-monitor-status.js';
import {
  FormLearningStatus,
  FormLearningOutcome,
} from '../src/web/form-learning-status.js';
import { FormInspectionReport } from '../src/web/forms-view.js';
import { FormReviewJournal } from '../src/web/form-review-journal.js';
import { FormReviewControls } from '../src/web/form-review-controls.js';
import { availableLocales } from '../src/web/i18n.js';
import { renderInLocale } from './util-render.js';

const documentHarness = (learning = false) => {
  const events = new Map();
  const scheduled = new Map();
  const captures = [];
  let value = '';
  let sequence = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const context = {
    document: {
      readyState: 'complete',
      addEventListener: (name, listener) => events.set(name, listener),
    },
    MutationObserver: class {
      observe() {}
    },
    addEventListener: (name, listener) => events.set(name, listener),
    clearTimeout: (id) => scheduled.delete(id),
    setTimeout: (callback) => {
      scheduled.set(++sequence, callback);
      return sequence;
    },
    read: () => ({ fields: [{ value }] }),
    learning: () => ({ read: () => ({ at: ++sequence, edits: 0, intent: 0 }) }),
    capture: (snapshot) => {
      captures.push(snapshot);
      return pending;
    },
  };
  runInNewContext(
    `(${observeFormDocument.toString()})(read, 'capture', ${learning ? 'learning' : 'undefined'})`,
    context
  );
  return {
    captures,
    release,
    edit: (answer) => {
      value = answer;
      events.get('input')();
    },
    next: () => events.get('click')(),
    flush: () => {
      for (const callback of [...scheduled.values()]) {
        callback();
      }
    },
  };
};

test('learning timestamps do not create duplicate captures for unchanged clicks', () => {
  const document = documentHarness(true);
  try {
    document.next();
    document.next();
    assert.equal(document.captures.length, 1);
  } finally {
    document.release();
  }
});

test(
  'Next sends the owner edit before replacing a document even while an earlier capture awaits acknowledgement',
  { timeout: 5000 },
  async () => {
    const document = documentHarness();
    try {
      assert.equal(document.captures.length, 1);
      document.edit('Owner changed the answer');
      document.flush();
      assert.equal(
        document.captures.length,
        1,
        'debounced changes coalesce behind the held acknowledgement'
      );
      document.next();
      assert.equal(
        document.captures.length,
        2,
        'Next flushes before the page can be replaced'
      );
      assert.equal(
        document.captures[1].fields[0].value,
        'Owner changed the answer'
      );
      document.next();
      assert.equal(
        document.captures.length,
        2,
        'unchanged clicks are deduplicated'
      );
    } finally {
      document.release();
    }
  }
);

test(
  'oversized page edits are reported once without sending or retaining their contents',
  { timeout: 5000 },
  () => {
    const document = documentHarness();
    try {
      document.edit('x'.repeat(2 * 1024 ** 2 + 1));
      document.next();
      assert.equal(document.captures.length, 2);
      assert.equal(
        JSON.stringify(document.captures[1]),
        '{"omission":"capture-size-limit"}'
      );
      document.next();
      assert.equal(document.captures.length, 2);
    } finally {
      document.release();
    }
  }
);

test('capture states, opt-out, observed Next and passive journal omissions are translated in all interface languages', () => {
  const report = {
    title: '<Question>',
    url: 'https://example.test/form',
    fields: [],
    frames: [],
    omissions: [{ reason: 'other-documents-not-sampled' }],
    coverage: 'partial',
    navigation: { nextPage: true },
  };
  for (const locale of availableLocales) {
    const html = renderInLocale(
      locale.id,
      React.createElement('div', null, [
        ...['active', 'disabled', 'unavailable', 'stopped'].map((state) =>
          React.createElement(FormMonitorStatus, {
            key: state,
            monitoring: {
              state,
              captured: 3,
              failed: 1,
              omitted: 2,
              learning: false,
            },
          })
        ),
        ...[
          'waiting-plan',
          'watching',
          'disabled',
          'incomplete',
          'failed',
          'stopped',
        ].map((state) =>
          React.createElement(FormLearningStatus, {
            key: `learn:${state}`,
            learning: {
              state,
              tracked: 2,
              saved: 1,
              failed: 0,
              omitted: 0,
              skipped: 1,
            },
          })
        ),
        ...['observed-submission', 'stable-owner-edit'].map((kind) =>
          React.createElement(FormLearningOutcome, {
            key: kind,
            learning: {
              kind,
              saved: 1,
              skipped: 1,
              pairs: [
                { question: '<Question>', text: '<script>canary</script>' },
              ],
            },
          })
        ),
        React.createElement(FormInspectionReport, { key: 'report', report }),
        React.createElement(FormReviewJournal, {
          key: 'journal',
          report: {
            checkpoints: [
              {
                action: 'observe',
                sequence: 1,
                capturedAt: '2026-11-10T18:00:00Z',
                report,
              },
            ],
            monitoring: { state: 'active', captured: 3, failed: 1, omitted: 2 },
            omittedCheckpoints: 0,
            coverage: 'partial',
          },
          Report: () => null,
        }),
        React.createElement(FormReviewControls, {
          key: 'controls',
          api: {},
          busy: false,
        }),
      ])
    );
    assert(
      !html.includes('forms.'),
      `all capture messages translated in ${locale.id}`
    );
    assert(html.includes('data-form-auto-capture=""'));
    assert(html.includes('data-form-learn=""'));
    assert(!html.includes('<script>canary</script>'));
    assert(html.includes('data-form-next-page=""'));
    assert(html.includes('data-form-monitor="active"'));
    assert(html.includes('data-form-checkpoint="1"'));
    assert(!html.includes('data-action="apply-form-plan"'));
  }
});
