import test from 'node:test';
import assert from 'node:assert/strict';
import { hhCaptchaDocument } from './helpers/hh-captcha-document.mjs';
import { readFormDocument } from '../src/forms/read-document.js';
import {
  applicationDocument,
  applicationSelectors,
} from '../src/jobs/application-page.js';
import { applicationState } from '../src/jobs/application-options.js';

for (const marker of [
  'input[data-qa="account-captcha-input"]',
  'input[name="captchaText"]',
  '.smart-captcha',
]) {
  for (const completed of marker === '.smart-captcha'
    ? [false]
    : [false, true]) {
    test(`HH ${marker}, completed widget ${completed}: generic review is metadata only`, () => {
      const fixture = hhCaptchaDocument(marker, { completed });
      const report = fixture.evaluate(readFormDocument, {});
      assert.equal(report.challenge.active, true);
      assert.equal(report.fields.length, 0);
      assert.equal(report.title, '');
      assert.equal(report.intro, '');
      assert.equal(report.reasons[0], 'owner-verification');
      assert.deepEqual(fixture.reads, []);
    });
  }
  for (const limit of [false, true]) {
    test(`HH ${marker}, daily limit ${limit}: native guards never inspect or dispatch the challenge`, () => {
      const fixture = hhCaptchaDocument(marker, { limit });
      const input = {
        url: 'https://hh.ru/vacancy/123',
        selectors: applicationSelectors,
      };
      const page = fixture.evaluate(applicationDocument, input, true);
      assert.equal(page.challenge, true);
      assert.equal(page.dailyLimit, limit);
      assert.equal(
        applicationState(page),
        limit ? 'daily-limit' : 'verification'
      );
      assert.equal(page.scope, false);
      assert.equal(page.fieldIndices.length, 0);
      assert.equal(
        page.scopeKey.includes('synthetic-completed-widget-token'),
        false
      );
      assert.equal(page.letter, null);
      for (const action of ['submit', 'enter', 'letter', 'limitRefresh']) {
        const result = fixture.evaluate(
          applicationDocument,
          {
            ...input,
            action,
            guard: JSON.stringify(page),
            text: 'must not write',
          },
          true
        );
        assert.equal(result.dispatched ?? result.navigated, false);
      }
      assert.equal(fixture.clicks, 0);
      assert.deepEqual(fixture.reads, []);
    });
  }
}
