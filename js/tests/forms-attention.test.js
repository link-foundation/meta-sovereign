import test from 'node:test';
import assert from 'node:assert/strict';
import { clearTimeout, setTimeout } from 'node:timers';
import { automaticFormEnvironment } from './helpers/forms-auto-prefill-fixture.mjs';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import { formDeadlineClock } from '../../experiments/issue-56/form-deadline-clock.mjs';
import { pendingPrefill } from '../src/forms/challenge-wait.js';

const waitingForm = async (t, { headless = false, clock } = {}) => {
  let focused = 0;
  const env = await automaticFormEnvironment(2, {
    openSession: async () => ({
      policy: { headless },
      page: {
        isClosed: () => false,
        bringToFront: async () => {
          focused += 1;
        },
      },
      commander: { goto: async () => {} },
      close: async () => {},
    }),
    review: {
      now: clock?.now,
      timers: clock?.timers,
      challenge: { waitMs: 10000, pollMs: 20 },
    },
  });
  t.after(() => env.reader.stop());
  env.report.challenge = { active: true, kind: 'captcha' };
  return { env, focused: () => focused };
};

test('a stale request cannot bring a newer verification window forward', async (t) => {
  const { env, focused } = await waitingForm(t);
  await env.prefill({ requestId: 'current-request' });
  for (const requestId of ['old-request', '', null]) {
    await assert.rejects(env.reader.focusReview(env.session.id, requestId), {
      code: 'form-attention-ended',
    });
  }
  assert.equal(focused(), 0);
});

test('an active prefill exposes only its wait and matches focus to the original request', async (t) => {
  const { env, focused } = await waitingForm(t);
  const { id } = env.session;
  assert.deepEqual(env.reader.listReviews().attention, []);
  const waiting = await env.prefill();
  assert.equal(waiting.state, 'waiting-owner');
  const { requestId, wait } = waiting;
  const attention = {
    id,
    browserSlot: env.session.browserSlot,
    requestId,
    ...wait,
    focusAvailable: true,
  };
  assert.deepEqual(env.reader.listReviews().attention, [attention]);
  assert.deepEqual(env.reader.reviewAttention(), {
    ok: true,
    attention: [attention],
  });
  await assert.rejects(env.reader.focusReview(id, 'different-request'), {
    code: 'form-attention-ended',
  });
  assert.equal(focused(), 0);
  assert.equal((await env.reader.focusReview(id, requestId)).ok, true);
  assert.equal(focused(), 1);
  assert.equal(env.textWrites.length, 0);
  await env.reader.closeReview(id);
  assert.deepEqual(env.reader.reviewAttention().attention, []);
  await assert.rejects(env.reader.focusReview(id, requestId), {
    code: 'form-session-missing',
  });
  assert.equal(focused(), 1);
});

test('headless reviews disclose the wait without offering browser focus', async (t) => {
  const { env, focused } = await waitingForm(t, { headless: true });
  const waiting = await env.prefill();
  const [attention] = env.reader.reviewAttention().attention;
  assert.equal(attention.focusAvailable, false);
  await assert.rejects(
    env.reader.focusReview(env.session.id, waiting.requestId),
    {
      code: 'form-focus-unavailable',
    }
  );
  assert.equal(focused(), 0);
  assert.equal(env.textWrites.length, 0);
});

test(
  'the wait expires before another focus even if the task is still being cleaned up',
  { timeout: 5000 },
  async (t) => {
    const clock = formDeadlineClock();
    const { env, focused } = await waitingForm(t, { clock });
    const waiting = await env.prefill();
    assert.equal(env.reader.reviewAttention().attention.length, 1);
    clock.advance(10000);
    assert.deepEqual(env.reader.reviewAttention().attention, []);
    await assert.rejects(
      env.reader.focusReview(env.session.id, waiting.requestId),
      {
        code: 'form-attention-ended',
      }
    );
    assert.equal(focused(), 0);
    assert.equal(env.textWrites.length, 0);
  }
);

for (const media of [LINO_TEXT, LINO_BINARY]) {
  test(`waiting reviews and guarded focus share ${media}`, async (t) => {
    const { env, focused } = await waitingForm(t);
    const { server, base, post } = await formReviewHttp(env.options, media);
    t.after(server.close);
    const opened = await post('open', { url: env.report.url });
    const { id } = opened.session;
    const requestId = 'attention-wire-proof';
    const waiting = await post('prefill', {
      id,
      requestId,
      profileId: env.profile.id,
    });
    assert.equal(waiting.state, 'waiting-owner');
    const read = async () => {
      const response = await fetch(`${base}/api/forms/sessions/attention`, {
        headers: { accept: media },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type')?.split(';')[0], media);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return readWireResponse(response);
    };
    const receipt = await read();
    assert.deepEqual(receipt.attention, [
      {
        id,
        browserSlot: opened.session.browserSlot,
        requestId,
        ...waiting.wait,
        focusAvailable: true,
      },
    ]);
    const stale = await post('focus', { id, requestId: 'old-request' });
    assert.equal(stale.code, 'form-attention-ended');
    assert.equal(focused(), 0);
    const forbidden = await post(
      'focus',
      { id, requestId },
      { origin: 'https://untrusted.test' }
    );
    assert.equal(forbidden.code, 'forbidden');
    assert.equal(focused(), 0);
    const exact = await post('focus', { id, requestId });
    assert.equal(exact.ok, true);
    assert.equal(focused(), 1);
    await post('close', { id });
    assert.deepEqual((await read()).attention, []);
  });
}

for (const automatic of [false, true]) {
  test(
    `foreground Forms exposes list and exact focus during ${automatic ? '--prefill' : 'interactive prefill'}`,
    { timeout: 5000 },
    async (t) => {
      const { env, focused } = await waitingForm(t);
      await env.reader.stop();
      const output = [];
      let complete;
      const completion = new Promise((resolve) => {
        complete = resolve;
      });
      let fallback;
      const release = () => {
        delete env.report.challenge;
      };
      t.after(() => clearTimeout(fallback));
      const cli = createFormsCommands({
        ...env.options,
        openStore: async () => env.options.store,
        async *reviewInput() {
          if (!automatic) {
            yield 'prefill form-1';
          }
          yield 'list';
          const wait = output.find((entry) => entry.state === 'waiting-owner');
          yield 'focus form-1 stale-request';
          if (wait) {
            yield `focus form-1 ${wait.requestId}`;
          }
          release();
          await completion;
          yield 'quit';
        },
      });
      const status = await cli['forms-review'](
        {
          url: env.report.url,
          prefill: automatic,
          'no-learn': true,
          'profile-id': env.profile.id,
        },
        (line) => {
          const entry = JSON.parse(line);
          output.push(entry);
          if (entry.state === 'waiting-owner') {
            fallback = setTimeout(release, 300);
          }
          if (entry.mode === 'prefill-result' && !pendingPrefill(entry)) {
            complete();
          }
        }
      );
      const wait = output.find((entry) => entry.state === 'waiting-owner');
      const receipt = output.find((entry) => entry.attention?.length);
      assert.equal(receipt?.attention[0].requestId, wait.requestId);
      assert.equal(
        output.filter((entry) => entry.code === 'form-attention-ended').length,
        1
      );
      assert.equal(focused(), 1);
      const result = output.find(
        (entry) => entry.mode === 'prefill-result' && !pendingPrefill(entry)
      );
      assert.equal(
        status,
        0,
        JSON.stringify(
          output
            .filter((entry) => !entry.ok)
            .map(({ state, code, error }) => ({ state, code, error }))
        )
      );
      assert.equal(
        env.textWrites.length,
        2,
        JSON.stringify({
          state: result?.state,
          code: result?.code,
          error: result?.error,
        })
      );
      assert.equal(result.requestId, wait.requestId);
      assert.equal(result.submissionAttempted, false);
    }
  );
}

for (const ending of ['close', 'quit', 'eof']) {
  test(
    `foreground Forms drains the owner wait on ${ending}`,
    { timeout: 5000 },
    async (t) => {
      const { env } = await waitingForm(t);
      await env.reader.stop();
      const closed = [];
      const output = [];
      let fallback;
      t.after(() => clearTimeout(fallback));
      const cli = createFormsCommands({
        ...env.options,
        openSession: async (options) => {
          const browser = await env.options.openSession(options);
          return {
            ...browser,
            close: async () => closed.push(options.browserSlot),
          };
        },
        openStore: async () => env.options.store,
        async *reviewInput() {
          if (ending === 'close') {
            yield 'close form-1';
            yield 'list';
          }
          if (ending !== 'eof') {
            yield 'quit';
          }
        },
      });
      const status = await cli['forms-review'](
        {
          url: env.report.url,
          prefill: true,
          'no-learn': true,
          'profile-id': env.profile.id,
        },
        (line) => {
          const entry = JSON.parse(line);
          output.push(entry);
          if (entry.state === 'waiting-owner') {
            fallback = setTimeout(() => {
              delete env.report.challenge;
            }, 300);
          }
        }
      );
      assert.equal(status, 0);
      assert.equal(closed.length, 1);
      assert.deepEqual(env.textWrites, []);
      assert.equal(env.report.challenge?.active, true);
      assert.equal(
        output.filter((entry) => entry.mode === 'prefill-result').length,
        1
      );
      if (ending === 'close') {
        assert(output.some((entry) => entry.ok && entry.state === 'closed'));
        assert.deepEqual(output.find((entry) => entry.attention).attention, []);
      }
    }
  );
}
