import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { CAPTCHA_WAIT_MS } from '../src/forms/challenge-wait.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  withApplicationRouteFixture,
  runApplicationFixtureCommand,
} from './helpers/application-controls.mjs';

const waitingApplication = async (t, options = {}, input = {}) => {
  const fixture = applicationFixture(options);
  t.after(() => fixture.close());
  fixture.state.page.challenge = true;
  const receipt = await fixture.service['application-open']({
    ...applicationInput,
    ...input,
  });
  assert.equal(receipt.state, 'verification');
  return { fixture, receipt };
};
const attentionOf = async (fixture) =>
  (await fixture.service['application-attention']()).attention;
const focus = (fixture, input) =>
  fixture.service['application-attention-focus'](input);

test(
  'owner attention names the exact browser and excludes application and challenge contents',
  { timeout: 4000 },
  async (t) => {
    const { fixture, receipt } = await waitingApplication(
      t,
      {},
      { browserSlot: 'interview', coverLetter: 'Private employer draft.' }
    );
    const before = await fixture.store.query();
    const [notice] = await attentionOf(fixture);
    assert.deepEqual(Object.keys(notice).sort(), [
      'browserSlot',
      'expiresAt',
      'focusAvailable',
      'id',
      'kind',
      'requestId',
      'startedAt',
    ]);
    assert.equal(notice.kind, 'hh-application-verification');
    assert.equal(notice.browserSlot, 'interview');
    assert.equal(notice.requestId, receipt.requestId);
    assert.equal(notice.focusAvailable, true);
    assert.deepEqual(await attentionOf(fixture), [notice]);
    for (const change of [
      { id: 'previous-wait' },
      { browserSlot: 'other' },
      { requestId: 'prior-request' },
    ]) {
      await assert.rejects(focus(fixture, { ...notice, ...change }), {
        code: 'jobs-attention-ended',
      });
    }
    assert.equal(fixture.state.focuses, 0);
    assert.deepEqual(await focus(fixture, notice), { ok: true });
    assert.equal(fixture.state.focuses, 1);
    assert.equal(fixture.state.entered, 0);
    assert.equal(fixture.state.submitted, 0);
    assert.deepEqual(fixture.state.writes, []);
    assert.deepEqual(await fixture.store.query(), before);
  }
);

test(
  'manual dismissal, changed document, and closure invalidate the observed wait',
  { timeout: 4000 },
  async (t) => {
    const { fixture, receipt } = await waitingApplication(t);
    const [first] = await attentionOf(fixture);
    fixture.state.page.challenge = false;
    assert.deepEqual(await attentionOf(fixture), []);
    await assert.rejects(focus(fixture, first), {
      code: 'jobs-attention-ended',
    });
    const stillHeld = await fixture.service['application-status'](
      applicationIdentity(receipt)
    );
    assert.equal(stillHeld.hold, 'verification');
    fixture.state.page.challenge = true;
    const next = await fixture.service['application-read'](
      applicationIdentity(receipt)
    );
    const [second] = await attentionOf(fixture);
    assert.notEqual(second.id, first.id);
    fixture.state.page.documentKey = 'new-document';
    await assert.rejects(focus(fixture, second), {
      code: 'jobs-attention-ended',
    });
    const newest = await fixture.service['application-read'](
      applicationIdentity(next)
    );
    const [third] = await attentionOf(fixture);
    assert.notEqual(third.id, second.id);
    await fixture.service['application-close'](applicationIdentity(newest));
    assert.deepEqual(await attentionOf(fixture), []);
    await assert.rejects(focus(fixture, third), {
      code: 'jobs-attention-ended',
    });
    assert.equal(fixture.state.focuses, 0);
  }
);

test(
  'headless verification remains visible with a finite lifetime and refuses focus',
  { timeout: 4000 },
  async (t) => {
    let now = Date.UTC(2026, 10, 23);
    const { fixture } = await waitingApplication(
      t,
      { application: { now: () => now } },
      { headless: true }
    );
    const [notice] = await attentionOf(fixture);
    assert.equal(notice.focusAvailable, false);
    await assert.rejects(focus(fixture, notice), {
      code: 'jobs-attention-focus-unavailable',
    });
    now += CAPTCHA_WAIT_MS;
    assert.deepEqual(await attentionOf(fixture), []);
    await assert.rejects(focus(fixture, notice), {
      code: 'jobs-attention-ended',
    });
    assert.equal(fixture.state.focuses, 0);
  }
);

test(
  'a focus started before Close refuses once the owning browser is released',
  { timeout: 4000 },
  async (t) => {
    const blocked = Promise.withResolvers();
    const started = Promise.withResolvers();
    let probe = false;
    const { fixture, receipt } = await waitingApplication(t, {
      application: {
        readVerification: async () => {
          if (probe) {
            started.resolve();
            await blocked.promise;
          }
          return { ...fixture.state.page };
        },
      },
    });
    const [notice] = await attentionOf(fixture);
    probe = true;
    const focusing = assert.rejects(focus(fixture, notice), {
      code: 'jobs-attention-ended',
    });
    await started.promise;
    try {
      await fixture.service['application-close'](applicationIdentity(receipt));
    } finally {
      blocked.resolve();
    }
    await focusing;
    assert.equal(fixture.state.focuses, 0);
  }
);

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `HeadHunter attention and explicit focus share ${type}`,
    { timeout: 10000 },
    async (t) => {
      const { fixture } = await waitingApplication(t);
      await withApplicationRouteFixture(fixture, type, async (api, base) => {
        const source = `${base}/api/vacancies/application-attention`;
        assert.equal(
          (await fetch(source, { headers: { accept: type } })).headers.get(
            'cache-control'
          ),
          'no-store'
        );
        const [notice] = (await api.vacancyApplicationAttention()).attention;
        const refused = await fetch(`${source}-focus`, {
          method: 'POST',
          headers: { origin: 'https://unrelated.example' },
        });
        assert.equal(refused.status, 403);
        assert.equal(fixture.state.focuses, 0);
        assert.deepEqual(await api.vacancyApplicationAttentionFocus(notice), {
          ok: true,
        });
        assert.equal(fixture.state.focuses, 1);
      });
    }
  );
}

test(
  'foreground application can list a verification wait and focus only its displayed ID',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    fixture.state.page.challenge = true;
    const actions = async function* () {
      yield 'attention';
      yield 'focus stale';
      const [notice] = await attentionOf(fixture);
      yield `focus ${notice.id}`;
      yield 'quit';
    };
    const { status, output } = await runApplicationFixtureCommand(
      fixture,
      actions
    );
    assert.equal(status, 0);
    assert(
      output.some(
        (row) => row.attention?.[0].kind === 'hh-application-verification'
      )
    );
    assert(output.some((row) => row.code === 'jobs-attention-ended'));
    assert.deepEqual(output.at(-1), { ok: true });
    assert.equal(fixture.state.focuses, 1);
    assert.equal(fixture.state.closed, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);
