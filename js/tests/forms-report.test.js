import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { FormInspectionReport } from '../src/web/forms-view.js';
import { renderInLocale } from './util-render.js';
import { availableLocales } from '../src/web/i18n.js';

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
