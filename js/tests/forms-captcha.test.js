import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFormDocument } from '../src/forms/read-document.js';
import { automaticFormEnvironment } from './helpers/forms-auto-prefill-fixture.mjs';
import {
  waitForManualChallenge,
  CAPTCHA_WAIT_MS,
  pendingPrefill,
} from '../src/forms/challenge-wait.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { createFormPrefillRequest } from '../src/web/form-prefill-request.js';
import { FormAutomaticResult } from '../src/web/form-automatic-result.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import { awaitFormPrefill } from '../src/cli/forms-prefill-wait.js';
import { formDeadlineClock } from '../../experiments/issue-56/form-deadline-clock.mjs';
import { createPrefillControl } from '../src/forms/prefill-control.js';

const delay = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const completed = async (reader, initial) => {
  let result = initial;
  for (let i = 0; i < 100 && pendingPrefill(result); i++) {
    await delay();
    result = await reader.prefillStatus({
      id: initial.reviewSession.id,
      requestId: initial.requestId,
    });
  }
  assert(!pendingPrefill(result), 'owned operation must settle');
  return result;
};
const challenge = { active: true, kind: 'captcha' };
const settings = { review: { challenge: { waitMs: 2000, pollMs: 5 } } };
const uiPrefill = (env) => {
  const calls = { posts: 0, reads: 0 };
  const invoke = (name, method) => (input) => {
    calls[name]++;
    return env.reader[method](input);
  };
  return {
    calls,
    request: createFormPrefillRequest({
      formsPrefillReview: invoke('posts', 'prefillReview'),
      formsPrefillStatus: invoke('reads', 'prefillStatus'),
    }),
    input: { id: env.session.id, profileId: env.profile.id },
  };
};

const challengeDocument = (url, inline = false) => {
  const root = {
    closest: () => null,
    getClientRects: () => [1],
    get value() {
      return assert.fail('must never read the challenge answer');
    },
    get textContent() {
      return assert.fail('must never read challenge instructions');
    },
  };
  const document = {
    location: { href: url },
    get title() {
      return assert.fail('must never read challenge title');
    },
    querySelectorAll: (selector) =>
      inline && selector.includes('.smart-captcha') ? [root] : [],
  };
  return vm.runInNewContext(`(${readFormDocument.toString()})()`, {
    document,
    URL,
    crypto: { getRandomValues: (value) => value.fill(1) },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  });
};

test('CAPTCHA documents and visible widgets are metadata only, never answer evidence', () => {
  for (const [url, inline] of [
    ['https://practicum.yandex.ru/showcaptcha?retpath=private', false],
    ['https://smartcaptcha.yandexcloud.net/challenge', false],
    ['https://example.test/form', true],
  ]) {
    const report = challengeDocument(url, inline);
    assert.equal(report.challenge.active, true);
    assert.equal(report.fields.length, 0);
    assert.equal(report.intro, '');
    assert.equal(report.title, '');
    assert.equal(report.reasons[0], 'owner-verification');
  }
});

test(
  'an empty inspection never reports automatic prefill complete',
  { timeout: 3000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    env.report.fields = [];
    const result = await env.prefill();
    assert.equal(result.ok, false);
    assert.equal(result.complete, false);
    assert.equal(result.state, 'refused');
    assert.equal(result.code, 'form-no-fields');
    assert.equal(env.textWrites.length, 0);
  }
);

test(
  'CAPTCHA pauses the ordinary deadline, preserves one request and resumes a fresh guarded plan',
  { timeout: 5000 },
  async (t) => {
    const clock = formDeadlineClock();
    const env = await automaticFormEnvironment(2, {
      review: {
        deadlineMs: 100,
        now: clock.now,
        timers: clock.timers,
        challenge: { waitMs: 2000, pollMs: 5 },
      },
    });
    t.after(() => env.reader.stop());
    env.report.challenge = challenge;
    const requestId = 'manual-owner-one';
    const initial = await env.prefill({ requestId });
    assert.equal(initial.state, 'waiting-owner');
    assert.equal(initial.complete, false);
    assert.equal(initial.reviewSession.busy, true);
    assert.equal(env.textWrites.length, 0);
    clock.advance(120);
    await delay();
    const snapshot = await env.reader.prefillStatus({
      id: env.session.id,
      requestId,
    });
    assert.equal(snapshot.state, 'waiting-owner');
    snapshot.receipts.push({ status: 'forged' });
    assert.equal((await env.prefill({ requestId })).receipts.length, 0);
    await assert.rejects(env.prefill({ requestId, approximate: false }), {
      code: 'form-prefill-conflict',
    });
    await assert.rejects(env.prefill(), { code: 'form-busy' });
    await assert.rejects(env.reader.planReview({ id: env.session.id }), {
      code: 'form-busy',
    });
    let guarded = 0;
    env.hooks.check = async () => {
      if (++guarded === 1) {
        await delay(120);
      }
    };
    delete env.report.challenge;
    clock.advance(5);
    const result = await completed(env.reader, initial);
    assert.equal(result.state, 'partial');
    assert.equal(result.receipts.length, 2);
    assert.ok(
      guarded > 0,
      'the resumed plan must pass the deliberately delayed guard'
    );
    assert.equal(env.textWrites.length, 2);
    assert.equal(result.submissionAttempted, false);
    await env.prefill({ requestId });
    assert.equal(env.textWrites.length, 2);
  }
);

test(
  'closing or stopping a manual CAPTCHA wait drains the owned task',
  { timeout: 5000 },
  async () => {
    for (const close of [true, false]) {
      const env = await automaticFormEnvironment(2, settings);
      try {
        env.report.challenge = challenge;
        const initial = await env.prefill();
        assert.equal(initial.state, 'waiting-owner');
        if (close) {
          assert.equal(
            (await env.reader.closeReview(env.session.id)).state,
            'closed'
          );
        } else {
          await env.reader.stop();
        }
        assert.equal(env.reader.listReviews().sessions.length, 0);
        assert.equal(env.textWrites.length, 0);
      } finally {
        await env.reader.stop();
      }
    }
  }
);

test(
  'manual verification cannot authorize an unrelated destination or an unreadable page',
  { timeout: 5000 },
  async (t) => {
    for (const unreadable of [false, true]) {
      const env = await automaticFormEnvironment(2, settings);
      t.after(() => env.reader.stop());
      env.report.challenge = challenge;
      const initial = await env.prefill();
      if (unreadable) {
        env.hooks.inspect = () => {
          throw Object.assign(new Error('read unavailable'), {
            code: 'form-read-unavailable',
          });
        };
      } else {
        delete env.report.challenge;
        env.report.url = 'https://example.test/another-vacancy';
      }
      const result = await completed(env.reader, initial);
      assert.equal(result.state, 'refused');
      assert.equal(
        result.code,
        unreadable ? 'form-read-unavailable' : 'form-changed'
      );
      assert.equal(env.textWrites.length, 0);
    }
  }
);

test(
  'the 30 minute ceiling expires without writes or overlapping inspections',
  { timeout: 3000 },
  async () => {
    let time = 0;
    let inspections = 0;
    let active = 0;
    let maximum = 0;
    let resumed = 0;
    const result = {};
    await assert.rejects(
      waitForManualChallenge({
        record: {
          url: 'https://example.test/form',
          pauseDeadline: (ms) => {
            assert.equal(ms, CAPTCHA_WAIT_MS);
            return () => {
              resumed++;
            };
          },
        },
        result,
        now: () => time,
        timers: {
          setTimeout: (callback, ms) => {
            time += ms;
            return setTimeout(callback, 0);
          },
          clearTimeout,
        },
        pollMs: CAPTCHA_WAIT_MS,
        check: () => {},
        inspect: async () => {
          maximum = Math.max(maximum, ++active);
          inspections++;
          await Promise.resolve();
          active--;
          return { url: 'https://example.test/form', challenge };
        },
      }),
      { code: 'form-captcha-timeout' }
    );
    assert.equal(time, 1800000);
    assert.equal(inspections, 1);
    assert.equal(maximum, 1);
    assert.equal(resumed, 1);
  }
);

test(
  'challenge reports refuse deterministic/model planning before knowledge is read',
  { timeout: 3000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    env.report.challenge = challenge;
    const store = new Proxy(
      {},
      { get: () => assert.fail('must not read answer knowledge') }
    );
    await assert.rejects(
      planFormAnswers(store, { inspection: env.report, modelDraft: true }),
      { code: 'form-captcha' }
    );
    await assert.rejects(
      env.reader.planReview({ id: env.session.id, modelDraft: true }),
      { code: 'form-captcha' }
    );
  }
);

test(
  'UI retains frozen settings across waiting receipts and uses read-only status',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment(2, settings);
    t.after(() => env.reader.stop());
    env.report.challenge = challenge;
    const { request, calls, input } = uiPrefill(env);
    const initial = await request.run(input);
    assert.equal(request.pending(), true);
    const markup = renderToStaticMarkup(
      React.createElement(FormAutomaticResult, {
        result: initial,
        Report: () => assert.fail('no question report while waiting'),
      })
    );
    assert.match(markup, /solve verification/iu);
    assert(!markup.includes('Questions still needing'));
    const cleared = renderToStaticMarkup(
      React.createElement(FormAutomaticResult, {
        result: { ...initial, state: 'prefilling' },
        Report: () => assert.fail('no question report while prefilling'),
      })
    );
    assert.match(cleared, /Verification cleared/u);
    assert(!cleared.includes('Solve the CAPTCHA yourself before'));
    assert.equal((await request.status()).state, 'waiting-owner');
    delete env.report.challenge;
    await completed(env.reader, initial);
    assert.equal((await request.status()).state, 'partial');
    assert.equal(request.pending(), false);
    assert.equal(calls.posts, 1);
    assert.equal(calls.reads, 2);
  }
);

test(
  'UI status stays pending until successful prefill cleanup completes',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment(2, settings);
    env.report.fields = env.report.fields.filter(
      (field) => field.type !== 'file'
    );
    env.report.challenge = challenge;
    let release;
    let started;
    const cleanup = new Promise((resolve) => {
      started = resolve;
    });
    const held = new Promise((resolve) => {
      release = resolve;
    });
    t.after(async () => {
      release();
      await env.reader.stop();
    });
    env.hooks.dispose = async () => {
      started();
      await held;
    };
    const { request, calls, input } = uiPrefill(env);
    const initial = await request.run(input);
    delete env.report.challenge;
    try {
      await cleanup;
      const status = await request.status();
      assert.equal(status.state, 'prefilling');
      assert.equal(status.ok, false);
      assert.equal(status.complete, false);
      assert.equal(request.pending(), true);
      assert.equal(status.receipts.length, 2);
      assert.equal(env.reader.listReviews().sessions[0].busy, true);
    } finally {
      release();
    }
    await completed(env.reader, initial);
    const result = await request.status();
    assert.equal(result.state, 'prefilled');
    assert.equal(result.ok, true);
    assert.equal(result.complete, true);
    assert.equal(request.pending(), false);
    assert.equal(calls.posts, 1);
    assert.equal(env.textWrites.length, 2);
  }
);

test('optional status diagnostics disclose shape only and cannot break recovery', () => {
  const events = [];
  const result = {
    state: 'prefilling',
    ok: false,
    complete: false,
    requestId: 'private-request',
    receipts: [{ answer: 'private-answer' }],
    uploads: [],
  };
  const control = createPrefillControl({
    get: () => ({
      lastPrefill: { result },
      task: {},
      browser: {
        trace: (event) => {
          events.push(event);
          throw new Error('diagnostic failed');
        },
      },
    }),
    check: () => {},
    identity: () => ({ id: 'owned' }),
  });
  const value = control.status({ id: 'owned', requestId: result.requestId });
  assert.equal(value.reviewSession.id, 'owned');
  assert.deepEqual(events, [
    {
      event: 'form-prefill-status',
      state: 'prefilling',
      ok: false,
      complete: false,
      busy: true,
      receipts: 1,
      uploads: 0,
    },
  ]);
});

test(
  'text and binary Lino expose waiting status without replaying a POST',
  { timeout: 10000 },
  async (t) => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await automaticFormEnvironment(2, settings);
      t.after(() => env.reader.stop());
      const http = await formReviewHttp(env.options, media);
      t.after(() => http.server.close());
      const opened = await http.post('open', { url: env.report.url });
      env.report.challenge = challenge;
      const input = {
        id: opened.session.id,
        requestId: 'lino-manual',
        profileId: env.profile.id,
      };
      const initial = await http.post('prefill', input);
      assert.equal(initial.state, 'waiting-owner');
      const statusUrl = `${http.base}/api/forms/sessions/prefill?${new URLSearchParams(input)}`;
      const status = async () =>
        readWireResponse(
          await fetch(statusUrl, { headers: { accept: media } })
        );
      assert.equal((await status()).state, 'waiting-owner');
      assert.equal(env.textWrites.length, 0);
      delete env.report.challenge;
      for (let i = 0; i < 100; i++) {
        const value = await status();
        if (!pendingPrefill(value)) {
          assert.equal(value.state, 'partial');
          break;
        }
        await delay();
        assert(i < 99, 'HTTP operation must settle');
      }
      assert.equal(env.textWrites.length, 2);
    }
  }
);

test(
  'CLI waits through a manual receipt using only status reads',
  { timeout: 3000 },
  async () => {
    const initial = {
      state: 'waiting-owner',
      requestId: 'cli',
      reviewSession: { id: 'owner' },
    };
    let reads = 0;
    const progress = [];
    const result = await awaitFormPrefill(
      {
        prefillStatus: async (input) => {
          assert.deepEqual(input, { id: 'owner', requestId: 'cli' });
          reads++;
          return { ...initial, state: 'partial' };
        },
      },
      initial,
      (value) => progress.push(value.state),
      () => false
    );
    assert.equal(result.state, 'partial');
    assert.deepEqual(progress, ['waiting-owner']);
    assert.equal(reads, 1);
  }
);

test(
  'the manual deadline ends waiting without writes and leaves no owned task running',
  { timeout: 3000 },
  async (t) => {
    const env = await automaticFormEnvironment(2, {
      review: { challenge: { waitMs: 40, pollMs: 5 } },
    });
    t.after(() => env.reader.stop());
    env.report.challenge = challenge;
    const initial = await env.prefill();
    assert.equal(initial.state, 'waiting-owner');
    for (
      let i = 0;
      i < 100 && env.reader.listReviews().sessions[0]?.busy;
      i++
    ) {
      await delay();
    }
    const session = env.reader.listReviews().sessions[0];
    assert(!session?.busy);
    assert.equal(env.textWrites.length, 0);
    if (session) {
      const result = env.reader.prefillStatus({
        id: session.id,
        requestId: initial.requestId,
      });
      assert.equal(result.state, 'refused');
      assert.equal(result.code, 'form-captcha-timeout');
    }
  }
);

test(
  'status and recovery do not overlap or multiply a pending CAPTCHA inspection',
  { timeout: 3000 },
  async (t) => {
    const env = await automaticFormEnvironment(2, settings);
    t.after(() => env.reader.stop());
    env.report.challenge = challenge;
    const initial = await env.prefill({ requestId: 'single-poll' });
    let release;
    let started;
    const pending = new Promise((resolve) => {
      started = resolve;
    });
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let inspections = 0;
    env.hooks.inspect = async () => {
      inspections++;
      started();
      await held;
    };
    try {
      await pending;
      await delay(20);
      await env.prefill({ requestId: 'single-poll' });
      await env.reader.prefillStatus({
        id: env.session.id,
        requestId: initial.requestId,
      });
      assert.equal(inspections, 1);
      assert.equal(env.textWrites.length, 0);
    } finally {
      env.hooks.inspect = null;
      delete env.report.challenge;
      release();
    }
    assert.equal((await completed(env.reader, initial)).state, 'partial');
  }
);

test(
  'focus remains available during an owned visible CAPTCHA wait',
  { timeout: 3000 },
  async (t) => {
    const { createFormSessions } =
      await import('../src/forms/review-sessions.js');
    const { reviewBrowser, reviewUrl } =
      await import('./helpers/forms-session-fixture.mjs');
    const browser = reviewBrowser();
    const reviews = createFormSessions({
      openSession: async () => browser,
      autoCapture: false,
      learn: false,
      challenge: { waitMs: 2000, pollMs: 5 },
      prefill: {
        inspect: async () => ({ url: reviewUrl, challenge, fields: [] }),
      },
    });
    t.after(() => reviews.stop());
    const { session } = await reviews.open({ url: reviewUrl });
    await reviews.prefill({ id: session.id, requestId: 'focus-owned' });
    assert.equal((await reviews.focus(session.id)).ok, true);
    assert.equal(
      browser.calls.filter(([action]) => action === 'focus').length,
      1
    );
    assert.equal(reviews.list().sessions[0].prefillState, 'waiting-owner');
    assert.equal((await reviews.close(session.id)).state, 'closed');
  }
);

test(
  'navigation between manual release and the new plan refuses automatic writes',
  { timeout: 3000 },
  async (t) => {
    const env = await automaticFormEnvironment(2, settings);
    t.after(() => env.reader.stop());
    env.report.challenge = challenge;
    const initial = await env.prefill();
    let clearedReads = 0;
    env.hooks.inspect = () => {
      if (!env.report.challenge && ++clearedReads === 2) {
        env.report.url = 'https://example.test/different-after-release';
      }
    };
    delete env.report.challenge;
    const result = await completed(env.reader, initial);
    assert.equal(result.state, 'refused');
    assert.equal(result.code, 'form-changed');
    assert.equal(env.textWrites.length, 0);
  }
);
