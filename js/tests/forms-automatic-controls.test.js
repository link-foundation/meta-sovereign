import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { automaticFormEnvironment } from './helpers/forms-auto-prefill-fixture.mjs';
import { createFormPrefillRequest } from '../src/web/form-prefill-request.js';
import { FormPlanControls } from '../src/web/forms-plan-controls.js';
import { FormAutomaticResult } from '../src/web/form-automatic-result.js';
import { FormInspectionReport } from '../src/web/forms-view.js';

test(
  'an interrupted UI request recovers its frozen settings and never repeats actual writes',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    const calls = [];
    const request = createFormPrefillRequest({
      formsPrefillReview: async (input) => {
        calls.push(globalThis.structuredClone(input));
        const result = await env.reader.prefillReview(input);
        if (calls.length === 1) {
          throw new Error('response lost after the browser writes');
        }
        return result;
      },
    });
    const input = {
      id: env.session.id,
      profileId: env.profile.id,
      file: env.file,
    };
    await assert.rejects(request.run(input), /response lost/u);
    assert.equal(request.pending(), true);
    input.profileId = 'qa-profile:later-choice';
    const result = await request.run(input);
    assert.equal(result.state, 'prefilled');
    assert.deepEqual(calls[1], calls[0]);
    assert.equal(request.pending(), false);
    assert.equal(env.textWrites.length, 2);
    assert.equal(env.uploads, 1);
  }
);

test(
  'malformed or foreign UI receipts retain the same recoverable request',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    for (const change of [
      (result) => ({ ...result, requestId: 'another-request' }),
      (result) => ({ ...result, reviewSession: { id: 'another-session' } }),
      (result) => ({ ...result, receipts: null }),
      (result) => ({ ...result, submissionAttempted: true }),
      (result) => ({ ...result, complete: undefined }),
    ]) {
      let attempts = 0;
      const ids = [];
      const request = createFormPrefillRequest({
        formsPrefillReview: async (input) => {
          ids.push(input.requestId);
          const result = await env.reader.prefillReview(input);
          return ++attempts === 1 ? change(result) : result;
        },
      });
      const input = { id: env.session.id, profileId: env.profile.id };
      await assert.rejects(request.run(input), {
        code: 'form-prefill-unknown',
      });
      assert.equal(request.pending(), true);
      assert.equal((await request.run(input)).state, 'partial');
      assert.equal(request.pending(), false);
      assert.equal(ids[0], ids[1]);
    }
    assert.equal(env.textWrites.length, 2);
  }
);

test(
  'UI requests refuse overlap and cannot recover on a different session',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    let release;
    let started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const request = createFormPrefillRequest({
      formsPrefillReview: async (input) => {
        started();
        await held;
        return env.reader.prefillReview(input);
      },
    });
    const input = { id: env.session.id, profileId: env.profile.id };
    const pending = request.run(input);
    try {
      await ready;
      await assert.rejects(request.run(input), { code: 'form-busy' });
    } finally {
      release();
    }
    await pending;
    const unavailable = createFormPrefillRequest({
      formsPrefillReview: async () => null,
    });
    await assert.rejects(unavailable.run(input), {
      code: 'form-prefill-unknown',
    });
    await assert.rejects(unavailable.run({ id: 'other' }), {
      code: 'form-prefill-pending',
    });
    assert.equal(env.textWrites.length, 2);
  }
);

test(
  'a confirmed refusal permits a distinct later UI request',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    const ids = [];
    const request = createFormPrefillRequest({
      formsPrefillReview: (input) => {
        ids.push(input.requestId);
        return env.reader.prefillReview(input);
      },
    });
    env.hooks.check = () => {
      throw Object.assign(new Error('changed page'), { code: 'form-changed' });
    };
    const input = { id: env.session.id, profileId: env.profile.id };
    assert.equal((await request.run(input)).state, 'refused');
    assert.equal(request.pending(), false);
    env.hooks.check = undefined;
    assert.equal((await request.run(input)).state, 'partial');
    assert.notEqual(ids[0], ids[1]);
    assert.equal(env.textWrites.length, 2);
  }
);

test('planner exposes explicit automatic filling only for a capable owned session', () => {
  const props = {
    api: {},
    report: { reviewSession: { id: 'owned' } },
    available: true,
    prefillAvailable: true,
    onPlan: () => {},
  };
  const render = (extra) =>
    renderToStaticMarkup(
      React.createElement(FormPlanControls, { ...props, ...extra })
    );
  const enabled = render();
  assert.match(enabled, /data-action="prefill-form"/u);
  assert.match(enabled, /Prefill empty fields/u);
  assert.match(enabled, /site may upload or save changes immediately/u);
  assert.match(enabled, /open Next and submit yourself/u);
  assert(!render({ prefillAvailable: false }).includes('prefill-form'));
  assert(!render({ report: {} }).includes('prefill-form'));
  assert.match(
    render({ busy: true }),
    /disabled=""[^>]*data-action="prefill-form"/u
  );
});

test(
  'automatic result renders actual receipts, PDF metadata, open questions and provenance',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    env.report.fields[1].label = 'Something only the owner knows';
    env.report.navigation = { nextPage: true };
    const result = await env.prefill({ file: env.file });
    const html = renderToStaticMarkup(
      React.createElement(FormAutomaticResult, {
        result,
        Report: FormInspectionReport,
      })
    );
    assert.match(html, /data-form-automatic-result="partial"/u);
    assert.match(html, /Applied and read back/u);
    assert.match(html, /synthetic-resume\.pdf/u);
    assert.match(html, /Something only the owner knows/u);
    assert.match(html, /open Next yourself/u);
    assert.match(html, /Ada Example/u);
    assert.match(html, /Owner profile/u);
    assert(!html.includes(env.file.data));
    const refused = renderToStaticMarkup(
      React.createElement(FormAutomaticResult, {
        result: { ...result, state: 'refused', ok: false },
        Report: FormInspectionReport,
      })
    );
    assert.match(refused, /Inspect confirmed changes/u);
    assert.match(refused, /Applied and read back/u);
    assert(!refused.includes('before any change'));
  }
);
