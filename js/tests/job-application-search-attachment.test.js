import test from 'node:test';
import assert from 'node:assert/strict';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationResult } from '../src/jobs/application-result.js';
import {
  applicationFixture,
  applicationInput,
  applicationPageFixture,
} from '../../experiments/issue-56/application-fixture.mjs';
import { originalApplicationSearch } from '../../experiments/issue-56/application-search-route-fixture.mjs';

const letter = 'Reviewed letter for the exact search card';
const input = {
  ...applicationInput,
  coverLetter: letter,
  applyFromVacancyPage: false,
  applicationSearchUrl: originalApplicationSearch,
};
const vacant = { offer: null, submit: null, value: null };
const offer = { disabled: false };

const searchFixture = async (
  t,
  { fallback, uncertain, challenge, noOffer } = {}
) => {
  const fixture = applicationFixture();
  await fixture.service.stop();
  const { state, serviceOptions } = fixture;
  const canonical = {
    ...applicationPageFixture(),
    delivered: true,
    enter: null,
    attachment: { ...vacant, offer: fallback && !noOffer ? offer : null },
  };
  state.page = canonical;
  const transitions = [];
  const openSession = serviceOptions.openSession;
  serviceOptions.openSession = async (options) => {
    const browser = await openSession(options);
    browser.page.waitForURL = async () => {};
    return browser;
  };
  const open = () => {
    state.page.attachment = {
      ...vacant,
      submit: { disabled: true },
      value: '',
    };
    return { dispatched: true };
  };
  serviceOptions.application.attachmentDocument = async (
    _browser,
    _record,
    action,
    guard
  ) => {
    if (!action) {
      return globalThis.structuredClone(state.page);
    }
    if (guard !== JSON.stringify(state.page)) {
      return { navigated: false };
    }
    transitions.push(action);
    if (action === 'attachmentOpen') {
      return open();
    }
    state.page =
      action === 'attachmentSearch'
        ? {
            ...canonical,
            url: originalApplicationSearch,
            documentKey: 'search-document',
            attachmentSearch: true,
            challenge: Boolean(challenge),
            delivered: !challenge,
            attachment: {
              ...vacant,
              offer: fallback || challenge ? null : offer,
            },
            returnSafe: Boolean(fallback && !challenge),
          }
        : { ...canonical, documentKey: 'canonical-fallback' };
    return { navigated: true };
  };
  serviceOptions.application.dispatch = async (_handle, _record, action) => {
    transitions.push(action);
    if (action === 'attachmentOpen') {
      return open();
    }
    if (uncertain) {
      throw new Error('Fixture lost the native send receipt');
    }
    state.page.attachment = vacant;
    return { dispatched: true };
  };
  serviceOptions.application.writeLetter = async (_browser, text) => {
    state.page.attachment = { ...vacant, value: text, submit: offer };
    return 'verified';
  };
  const service = createVacancyService(serviceOptions);
  t.after(() => service.stop());
  const start = (extra = {}) =>
    service['application-open']({ ...input, ...extra });
  const advance = (receipt, action = 'letter-prepare', confirm = true) =>
    service['application-advance']({
      ...input,
      revision: receipt.revision,
      action,
      confirm,
    });
  const status = () => service['application-status'](input);
  return { start, advance, status, transitions, state };
};

test('a separate search offer waits for confirmation and preserves its delivery reservation', async (t) => {
  const { start, advance, status, transitions } = await searchFixture(t, {
    uncertain: true,
  });
  const delivered = applicationResult(await start(), input);
  assert.equal(delivered.letterAttachment, 'search');
  assert.equal((await status()).letterAttachment, 'search');
  await assert.rejects(advance(delivered, 'letter-prepare', false), {
    code: 'jobs-application-confirmation',
  });
  assert.deepEqual(transitions, []);
  const prepared = applicationResult(await advance(delivered), input);
  assert.equal(prepared.letterAttachment, 'ready');
  assert.equal(JSON.stringify(prepared).includes(letter), false);
  assert.equal(Object.hasOwn(prepared.page, 'returnSafe'), false);
  await assert.rejects(
    advance(prepared, 'letter-send'),
    /lost the native send receipt/
  );
  const pending = applicationResult(await status(), input);
  assert.equal(pending.delivery, 'provider-confirmed');
  assert.equal(pending.letterAttachment, 'unknown');
  await assert.rejects(advance(pending, 'letter-send'), {
    code: 'jobs-application-already-attempted',
  });
  assert.deepEqual(transitions, [
    'attachmentSearch',
    'attachmentOpen',
    'attachmentSend',
  ]);
});

test('an exact empty search offer falls back to the same vacancy for preparation', async (t) => {
  const { start, advance, transitions } = await searchFixture(t, {
    fallback: true,
  });
  const prepared = applicationResult(await advance(await start()), input);
  assert.equal(prepared.page.url, input.url);
  assert.equal(prepared.letterAttachment, 'ready');
  assert.deepEqual(transitions, [
    'attachmentSearch',
    'attachmentVacancy',
    'attachmentOpen',
  ]);
  const sent = applicationResult(await advance(prepared, 'letter-send'), input);
  assert.equal(sent.letterAttachment, 'provider-confirmed');
});

test('a separate letter lookup leaves a search challenge open', async (t) => {
  const { start, advance, transitions } = await searchFixture(t, {
    challenge: true,
  });
  const held = applicationResult(await advance(await start()), input);
  assert.equal(held.state, 'verification');
  assert.equal(held.hold, 'verification');
  assert.equal(held.letterAttachment, 'needs-review');
  assert.deepEqual(transitions, ['attachmentSearch']);
});

test('unavailable separate cover letters retain a manual outcome without sending', async (t) => {
  const { start, advance, status, transitions } = await searchFixture(t, {
    fallback: true,
    noOffer: true,
  });
  const held = applicationResult(await advance(await start()), input);
  assert.equal(held.letterAttachment, 'needs-review');
  assert.equal((await status()).letterAttachment, 'needs-review');
  assert.deepEqual(transitions, ['attachmentSearch', 'attachmentVacancy']);
});

test('previewing a search letter performs no navigation or dispatch', async (t) => {
  const { start, advance, transitions } = await searchFixture(t);
  const preview = await start({ testMode: true });
  const staged = applicationResult(await advance(preview), input);
  assert.equal(staged.state, 'test-preview');
  assert.equal(staged.letterAttachment, 'search');
  assert.deepEqual(transitions, []);
});
