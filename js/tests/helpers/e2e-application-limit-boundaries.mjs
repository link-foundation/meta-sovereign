import assert from 'node:assert/strict';
import {
  applicationDocument,
  applicationSelectors,
} from '../../src/jobs/application-page.js';
import { applicationLimitDocument } from '../../src/jobs/application-limit-document.js';
import { readFormDocument } from '../../src/forms/read-document.js';
import { mountApplicationLimitChallenge } from '../../../experiments/issue-56/application-limit-challenge-dom.mjs';

const markup =
  '<!doctype html><title>Native boundary</title><body><h2 id="outside">Outside challenge instructions</h2><form id="native-form"><label>Recent experience<textarea id="answer">Actual answer</textarea></label><label>Cover letter<textarea id="letter">Complete letter</textarea></label><button type="submit" data-qa="vacancy-response-letter-submit">Send</button></form><p data-qa-popup-error-code="negotiations-limit-exceeded">Daily limit</p>';
const url = 'https://hh.ru/vacancy/123';
const inspect = (page, input) =>
  page.evaluate(
    `(${applicationLimitDocument.toString()})(null,${JSON.stringify(input)})`
  );
const prepare = async (page) => {
  await page.setContent(markup);
  await page.evaluate(mountApplicationLimitChallenge);
  const snapshot = await page.evaluate(
    `(${applicationDocument.toString()})(null,${JSON.stringify({ url, selectors: applicationSelectors })})`
  );
  await page.evaluate(() => {
    const forbidden = () => {
      throw new Error('Content escaped its native application form.');
    };
    Object.defineProperty(document, 'title', {
      get: forbidden,
      configurable: true,
    });
    for (const node of [
      document.querySelector('#outside'),
      ...document.querySelectorAll('#limit-captcha,#limit-captcha *'),
    ]) {
      for (const key of ['textContent', 'innerHTML', 'outerHTML']) {
        Object.defineProperty(node, key, {
          get: forbidden,
          configurable: true,
        });
      }
    }
    Object.defineProperty(
      document.querySelector('#outside').firstChild,
      'textContent',
      { get: forbidden }
    );
  });
  return {
    url,
    documentKey: snapshot.documentKey,
    submit: applicationSelectors.submit,
    until: '2026-11-14T02:00:00.000Z',
  };
};

/** One native document, finite refusal cases; no remote provider or challenge solver. */
export const verifyNativeApplicationLimitBoundaries = async (browser) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('https://hh.ru/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: markup })
  );
  let refusals = 0;
  try {
    await page.goto(url);
    let input = await prepare(page);
    assert((await page.evaluate(readFormDocument)).challenge.active);
    const raw = await page.evaluate(readFormDocument, { hhLimit: input });
    assert.equal(raw.scope, 'hh-limit-application-form');
    assert.deepEqual(raw.reasons, []);
    assert.deepEqual(
      raw.fields.map((field) => field.value),
      ['Actual answer', 'Complete letter']
    );
    const first = await inspect(page, input);
    assert.equal(typeof first.guard, 'string');
    const renew = await page.$('[data-qa="captcha-renew-text"]');
    assert.equal(
      await renew.evaluate(applicationLimitDocument, {
        ...input,
        guard: first.guard,
        action: 'dismiss',
      }),
      null
    );
    await renew.dispose();
    refusals++;
    const close = await page.$('[aria-label="Close"]');
    await page.locator('#answer').fill('Latest owner answer');
    assert.equal(
      await close.evaluate(applicationLimitDocument, {
        ...input,
        guard: first.guard,
        action: 'dismiss',
      }),
      null
    );
    await close.dispose();
    refusals++;
    for (const kind of [
      'duplicate-close',
      'nested-challenge',
      'ancestor-dialog',
      'challenge-root',
      'external-control',
      'hidden-widget',
      'no-pause',
      'wrong-document',
      'wrong-vacancy',
    ]) {
      input = await prepare(page);
      await page.evaluate((kind) => {
        const form = document.querySelector('#native-form');
        const gate = document.querySelector('#limit-captcha');
        if (kind === 'duplicate-close') {
          gate.insertAdjacentHTML(
            'beforeend',
            '<button type="button" aria-label="Close">Close</button>'
          );
        }
        if (kind === 'nested-challenge') {
          form.append(gate);
        }
        if (kind === 'ancestor-dialog') {
          gate.append(form);
        }
        if (kind === 'challenge-root') {
          form.id = 'captcha-form';
          Object.defineProperty(form, 'outerHTML', {
            get() {
              throw new Error('Challenge form markup was read.');
            },
          });
        }
        if (kind === 'external-control') {
          document.body.insertAdjacentHTML(
            'beforeend',
            '<textarea form="native-form">Outside form</textarea>'
          );
        }
        if (kind === 'hidden-widget') {
          form.insertAdjacentHTML(
            'beforeend',
            '<div class="smart-captcha" hidden></div>'
          );
        }
        if (kind === 'no-pause') {
          document.querySelector('[data-qa-popup-error-code]').remove();
        }
      }, kind);
      if (kind === 'wrong-document') {
        input.documentKey += '-changed';
      }
      if (kind === 'wrong-vacancy') {
        input.url = 'https://hh.ru/vacancy/456';
      }
      assert.equal(await inspect(page, input), null, kind);
      refusals++;
    }
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'label']) {
      input = await prepare(page);
      await page.evaluate((attribute) => {
        const node = document.querySelector('#answer');
        if (attribute === 'label') {
          const label = document.createElement('label');
          label.htmlFor = 'answer';
          label.append('External private label');
          Object.defineProperty(label.firstChild, 'textContent', {
            get() {
              throw new Error('External label was read.');
            },
          });
          document.body.append(label);
        } else {
          node.setAttribute(attribute, 'outside');
        }
      }, attribute);
      const report = await page.evaluate(readFormDocument, { hhLimit: input });
      assert(report.reasons.includes('external-form-reference'), attribute);
      refusals++;
    }
    assert.equal(await page.evaluate(() => globalThis.limitCaptchaCloses), 0);
    assert.equal(await page.evaluate(() => globalThis.limitCaptchaActions), 0);
    assert.deepEqual(errors, []);
    return {
      capturedFields: 2,
      refusals,
      ordinaryInspectionHeld: true,
      challengeContentReads: 0,
      closes: 0,
      actions: 0,
      errors,
    };
  } finally {
    await context.close();
  }
};
