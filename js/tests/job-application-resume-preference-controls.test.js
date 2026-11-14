import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationResumeView } from '../src/web/application-resume-view.js';
import { translate } from '../src/web/i18n.js';

test('four-language recovery displays acknowledged CV history without enabling a native action', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    for (const source of ['manual', 'context', 'native']) {
      const markup = renderToStaticMarkup(
        React.createElement(ApplicationResumeView, {
          receipt: {
            page: null,
            resumePreference: {
              title: '<Owner’s saved CV>',
              hash: null,
              source,
            },
          },
          writable: false,
          action: () => {
            throw new Error('Read-only history created an action');
          },
          t: (key, args) => translate(locale, key, args),
        })
      );
      assert(markup.includes(`data-application-resume-preference="${source}"`));
      assert(markup.includes('&lt;Owner'));
      assert.equal(markup.includes('<button'), false);
      assert.equal(markup.includes('application.'), false);
      if (locale !== 'en') {
        assert.notEqual(
          translate(locale, 'application.resumePreference'),
          translate('en', 'application.resumePreference')
        );
      }
    }
  }
});
