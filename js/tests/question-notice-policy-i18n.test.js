import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NoticePolicyFields } from '../src/web/question-notice-policy.js';
import { BrowserPendingTurn } from '../src/web/question-browser-pending.js';
import { AnswerEvidence } from '../src/web/question-evidence.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';
import { normalizeNoticePolicy } from '../src/automation/question-notice-policy.js';

test('all four locales render independent notice policies with invitations limited to review or ignore', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const t = (key) => translate(locale, key);
    const html = renderToStaticMarkup(
      React.createElement(
        LocaleContext.Provider,
        { value: { locale, t } },
        React.createElement(NoticePolicyFields, {
          value: normalizeNoticePolicy(),
          change: () => assert.fail('Rendering starts nothing'),
        })
      )
    );
    assert.equal((html.match(/<select /gu) ?? []).length, 3);
    assert.equal((html.match(/value="reply"/gu) ?? []).length, 2);
    assert.equal(html.includes(t('noticePolicy.invitations')), true);
    assert.equal(html.includes(t('noticePolicy.hint')), true);
    assert.equal(html.includes('noticePolicy.'), false);
    const render = (component, props) =>
      renderToStaticMarkup(
        React.createElement(
          LocaleContext.Provider,
          { value: { locale, t } },
          React.createElement(component, props)
        )
      );
    const snapshot = {
      question: { id: '1', body: 'Application received' },
      strictOptions: false,
    };
    const unverified = render(BrowserPendingTurn, { snapshot });
    assert.equal(unverified.includes(t('noticePolicy.historyVerified')), false);
    const verified = render(BrowserPendingTurn, {
      snapshot,
      historyVerified: true,
    });
    assert.equal(verified.includes(t('noticePolicy.historyVerified')), true);
    const answer = {
      match: 'exact',
      requiresReview: true,
      notice: true,
      rules: [],
    };
    const preview = render(AnswerEvidence, { answer });
    assert.equal(preview.includes(t('questions.reviewRequired')), true);
    const admitted = render(AnswerEvidence, { answer, noticeAdmitted: true });
    assert.equal(admitted.includes(t('noticePolicy.admitted')), true);
    assert.equal(admitted.includes(t('questions.noticeReview')), false);
    for (const [key, value] of Object.entries(dictionaries.en).filter(([key]) =>
      key.startsWith('noticePolicy.')
    )) {
      assert.equal(typeof dictionaries[locale][key], 'string');
      if (locale !== 'en') {
        assert.notEqual(dictionaries[locale][key], value, key);
      }
    }
  }
});
