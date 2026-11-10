import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { FormInspectionReport } from '../src/web/forms-view.js';
import { renderInLocale } from './util-render.js';
import { FormAnswer, FormPlanSummary } from '../src/web/forms-answer.js';
import { availableLocales } from '../src/web/i18n.js';
import { FormReviewControls } from '../src/web/form-review-controls.js';
import {
  FormReviewedPlan,
  FormApplicationResult,
} from '../src/web/form-reviewed-plan.js';

test('form reports explain partial coverage, escaped values and omitted contents in every locale', () => {
  const report = {
    title: 'Fixture questionnaire',
    url: 'https://example.test/form',
    coverage: 'partial',
    frames: [
      {
        id: 'frame-1',
        reasons: [
          'unexpanded-options',
          'custom-elements',
          'text-limit',
          'value-limit',
        ],
      },
    ],
    omissions: [{ reason: 'hidden-frame' }],
    fields: [
      {
        id: 'frame-1:field-1',
        frame: 'frame-1',
        label: '<script>question</script>',
        labelSource: 'aria-labelledby',
        type: 'text',
        group: { label: 'Profile' },
        description: 'Current answer',
        required: true,
        disabled: false,
        readOnly: true,
        value: '<img src=x>',
        valueOmitted: null,
        checked: null,
        options: [],
      },
      {
        id: 'frame-1:field-2',
        frame: 'frame-1',
        label: 'Password',
        labelSource: 'label',
        type: 'password',
        value: null,
        valueOmitted: 'password',
        checked: null,
        options: [],
      },
    ],
  };
  for (const locale of availableLocales) {
    const html = renderInLocale(
      locale.id,
      React.createElement(FormInspectionReport, { report })
    );
    assert.match(html, /data-form-report="partial"/);
    assert.match(html, /&lt;script&gt;question&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x&gt;/);
    assert.equal(
      html.includes('forms.'),
      false,
      `no untranslated report keys for ${locale.id}`
    );
    assert.match(html, /data-action="download-form-report"/);
  }
});

test('answer proposal provenance, limits and recovery wording exist in every locale', () => {
  const reasons = [
    'protected-field',
    'missing-label',
    'missing-profile',
    'choice-mismatch',
    'field-format',
    'no-answer',
    'current-value',
    'review',
    'planning-limit',
  ];
  const sources = [
    'profile',
    'exact',
    'template',
    'approximate',
    'salary',
    'assembled',
    'unresolved',
  ];
  for (const locale of availableLocales) {
    const html = renderInLocale(
      locale.id,
      React.createElement('div', null, [
        React.createElement(FormPlanSummary, {
          key: 'summary',
          planning: {
            proposed: 2,
            unresolved: 1,
            preserved: 1,
            profileSource: { name: 'Owner', revision: 'rev' },
          },
        }),
        ...reasons.map((reason, i) =>
          React.createElement(FormAnswer, {
            key: reason,
            answer: {
              reason,
              source: sources[i % sources.length],
              similarity: 0.85,
              proposal: i % 2 ? { value: 'Reviewed proposal' } : null,
              missing: ['email'],
              profileKeys: ['name'],
              rules: [{ id: 'qa-rule:test', question: '<Saved question>' }],
              evidence: ['reviewed source'],
              applySupported: false,
              effects: [
                { fieldId: 'office', label: '<Office>', checked: false },
              ],
            },
          })
        ),
      ])
    );
    assert(!html.includes('forms.'), `translated answer plan for ${locale.id}`);
    assert(html.includes('&lt;Saved question&gt;'));
    assert(html.includes('85%'));
    assert(html.includes('Reviewed proposal'));
    assert(html.includes('data-form-radio-effects'));
    assert(html.includes('&lt;Office&gt;'));
  }
});

test('review controls explain ownership, activity expiry and unchanged answers in every locale', () => {
  for (const locale of availableLocales) {
    const html = renderInLocale(
      locale.id,
      React.createElement(FormReviewControls, {
        api: {},
        busy: false,
        available: true,
        url: 'https://example.test/form',
        slot: 'form-1',
        setBusy: () => {},
        onReport: () => {},
      })
    );
    assert(
      !html.includes('forms.'),
      `translated review controls for ${locale.id}`
    );
    assert(html.includes('data-form-reviews'));
    assert(html.includes('data-action="open-form-review"'));
    assert(html.includes('24'));
  }
});

test('reviewed changes start unselected and report confirmed, partial and uncertain results in every locale', () => {
  for (const locale of availableLocales) {
    const html = renderInLocale(
      locale.id,
      React.createElement(FormReviewedPlan, {
        api: {},
        plan: { fields: [], reviewPlan: { maxSelected: 25 } },
        busy: false,
        setBusy: () => {},
        Report: () => null,
      })
    );
    assert(
      !html.includes('forms.'),
      `translated prefill controls for ${locale.id}`
    );
    assert.match(html, /data-form-replace=""/);
    assert(!html.includes('checked=""'));
    assert.match(html, /disabled="" data-action="apply-form-plan"/);
    for (const state of ['applied', 'partial', 'uncertain', 'refused']) {
      const rendered = renderInLocale(
        locale.id,
        React.createElement(FormApplicationResult, {
          result: {
            state,
            code: 'form-changed',
            receipts: [
              'applied',
              'unchanged',
              'uncertain',
              'not-attempted',
            ].map((status) => ({
              fieldId: `<${status}>`,
              status,
              effects: [
                {
                  fieldId: 'office',
                  label: '<Office>',
                  checked: false,
                  status,
                },
              ],
            })),
          },
        })
      );
      assert(
        !rendered.includes('forms.'),
        `translated ${state} result for ${locale.id}`
      );
      assert.match(rendered, /&lt;applied&gt;/);
      assert.match(rendered, /&lt;Office&gt;/);
      assert.match(rendered, /data-form-effect-receipt="uncertain"/);
      assert.match(rendered, new RegExp(`data-form-application="${state}"`));
    }
  }
});
