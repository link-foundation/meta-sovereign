import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';
import { encodeWire, decodeWire, LINO_TEXT } from '../../src/transport/lino.js';

const request = async (fixture, operation, input) => {
  const response = await fetch(
    `${fixture.base}/api/vacancies/application-${operation}`,
    {
      method: 'POST',
      headers: { 'content-type': LINO_TEXT, accept: LINO_TEXT },
      body: encodeWire(input),
    }
  );
  const value = decodeWire(
    await response.arrayBuffer(),
    response.headers.get('content-type')
  );
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
};
const identity = (receipt, extra = {}) => ({
  ...applicationInput,
  revision: receipt.revision,
  ...extra,
});
export const verifyNativeApplication = async (browser) => {
  const fixture = await applicationNativeFixture(browser);
  try {
    let receipt = await request(fixture, 'open', {
      ...applicationInput,
      coverLetter: 'Owner reviewed letter.',
    });
    assert.equal(receipt.state, 'ready');
    assert(
      receipt.vacancy.description.endsWith(
        'Employer’s final paragraph stays intact.'
      )
    );
    receipt = await request(
      fixture,
      'advance',
      identity(receipt, { action: 'enter', confirm: true })
    );
    assert.equal(receipt.state, 'review');
    assert.equal(receipt.exact, false);
    assert.match(
      receipt.page.url,
      /applicant\/vacancy_response\?vacancyId=123/u
    );
    receipt = await request(
      fixture,
      'prefill',
      identity(receipt, { confirm: true })
    );
    assert.equal(receipt.letter, 'verified');
    assert.equal(receipt.exact, true);
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((entry) => entry.url().startsWith('https://hh.ru'));
    assert.deepEqual(
      await page.evaluate(() => ({
        header: document.querySelector('#header').value,
        experience: document.querySelector('#experience').value,
        attempts: globalThis.applicationAttempts,
      })),
      {
        header: 'Owner header',
        experience: 'Five years building Python services.',
        attempts: 0,
      }
    );
    receipt = await request(
      fixture,
      'advance',
      identity(receipt, { action: 'submit', confirm: true })
    );
    assert.equal(receipt.state, 'delivered');
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.deepEqual(
      await page.evaluate(() => ({
        entries: globalThis.applicationEntries,
        attempts: globalThis.applicationAttempts,
        letter: globalThis.deliveredLetter,
      })),
      {
        entries: 1,
        attempts: 1,
        letter: 'Owner reviewed letter.',
      }
    );
    await request(fixture, 'close', identity(receipt));
    assert.deepEqual(fixture.errors, []);
    return {
      entry: 1,
      submission: 1,
      fullFormLetter: 'verified',
      header: 'preserved',
      exactSource: 'hh',
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};

export const verifyNativeApplicationGuards = async (browser) => {
  let mutate;
  const { dispatchApplication } =
    await import('../../src/jobs/application-page.js');
  const fixture = await applicationNativeFixture(browser, {
    application: {
      dispatch: async (handle, record, action) => {
        if (action === 'submit' && mutate) {
          await record.browser.page.evaluate(mutate);
        }
        return dispatchApplication(handle, record, action);
      },
    },
  });
  try {
    let receipt = await request(fixture, 'open', applicationInput);
    receipt = await request(
      fixture,
      'advance',
      identity(receipt, { action: 'enter', confirm: true })
    );
    receipt = await request(
      fixture,
      'prefill',
      identity(receipt, { confirm: true })
    );
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((entry) => entry.url().startsWith('https://hh.ru'));
    const changes = [
      [
        () =>
          document
            .querySelector('#native-form')
            .insertAdjacentHTML(
              'afterbegin',
              '<label id="new-question">New question<input></label>'
            ),
        () => document.querySelector('#new-question').remove(),
      ],
      [
        () => {
          const node = document.querySelector(
            '[data-qa="vacancy-response-letter-submit"]'
          );
          node.replaceWith(node.cloneNode(true));
        },
        () => {},
      ],
      [
        () => globalThis.history.pushState({}, '', '/vacancy/999'),
        () =>
          globalThis.history.pushState(
            {},
            '',
            '/applicant/vacancy_response?vacancyId=123'
          ),
      ],
      [
        () =>
          document.body.insertAdjacentHTML(
            'beforeend',
            '<input name="captcha" id="challenge">'
          ),
        () => document.querySelector('#challenge').remove(),
      ],
    ];
    for (const [change, restore] of changes) {
      mutate = change;
      receipt = await request(
        fixture,
        'advance',
        identity(receipt, { action: 'submit', confirm: true })
      );
      assert.equal(
        receipt.attempted.submit,
        false,
        'a known pre-dispatch refusal releases its reservation'
      );
      assert.equal(
        await page.evaluate(() => globalThis.applicationAttempts),
        0
      );
      await page.evaluate(restore);
      receipt = await request(fixture, 'read', identity(receipt));
      assert.equal(receipt.state, 'review');
    }
    mutate = null;
    receipt = await request(
      fixture,
      'advance',
      identity(receipt, { action: 'submit', confirm: true })
    );
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.equal(await page.evaluate(() => globalThis.applicationAttempts), 1);
    assert.deepEqual(fixture.errors, []);
    return {
      refusedChanges: changes.length,
      submission: 1,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
