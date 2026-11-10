import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { createFormReader } from '../src/forms/reader.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { startServer } from '../src/server/index.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { isReadRequest } from '../src/web/request-policy.js';
import { writableReviewField } from '../src/forms/review-targets.js';

const field = (id, label, extra = {}) => ({
  id: `frame-1:${id}`,
  frame: 'frame-1',
  index: 0,
  tag: 'input',
  type: 'text',
  label,
  labelSource: 'label',
  description: '',
  value: '',
  checked: null,
  required: false,
  disabled: false,
  readOnly: false,
  valueOmitted: null,
  options: [],
  ...extra,
});
const environment = async () => {
  const store = createMemoryStore();
  const profile = await saveAnswerProfile(store, {
    id: 'owner',
    name: 'Owner',
    values: { name: 'Ada Example', email: 'ada@example.test' },
  });
  await saveAnswerRule(store, {
    id: 'experience',
    question: 'Experience',
    answers: [{ text: 'Five years', approved: true, count: 1 }],
  });
  const report = {
    ok: true,
    version: 1,
    mode: 'read-only',
    targetLifetime: 'snapshot-only',
    scope: 'visible-current-pages',
    coverage: 'inspected',
    url: 'https://example.test/form',
    title: 'Form',
    capturedAt: '2026-11-10T15:00:00Z',
    omissions: [],
    frames: [
      {
        id: 'frame-1',
        parent: null,
        url: 'https://example.test/form',
        reasons: [],
      },
    ],
    fields: [
      field('name', 'Full name', { value: 'Owner text' }),
      field('email', 'Email', { type: 'email' }),
      field('experience', 'Experience'),
    ],
  };
  const page = new EventEmitter();
  page.isClosed = () => false;
  const writes = [];
  let disposed = 0;
  let closed = 0;
  let clock = 0;
  const item = {
    page,
    policy: { headless: false },
    commander: {
      goto: async () => {},
      evaluate: async () => ({
        ...globalThis.structuredClone(report),
        documentTime: 1,
        reasons: [],
      }),
    },
    close: async () => {
      closed++;
      page.emit('close');
    },
  };
  const hooks = {};
  const prefill = {
    inspect: async (_browser, options) => {
      options?.check?.();
      options?.onSnapshot?.({});
      return globalThis.structuredClone(report);
    },
    capture: async () => ({
      get: (id) => id,
      check: async () => hooks.check?.(),
      dispose: async () => {
        disposed++;
      },
    }),
    write: async (_browser, _target, chosen) => {
      writes.push(chosen.id);
      if (hooks.write) {
        return hooks.write(chosen);
      }
      const current = report.fields.find((entry) => entry.id === chosen.id);
      Object.assign(
        current,
        chosen.answer.proposal.checked === undefined
          ? { value: chosen.answer.proposal.value }
          : { checked: chosen.answer.proposal.checked }
      );
      await hooks.afterWrite?.(chosen);
    },
  };
  const options = {
    store,
    openSession: async () => item,
    availability: async () => ({ available: true }),
    review: { now: () => clock, prefill },
  };
  const reader = createFormReader(options);
  const { session } = await reader.openReview({ url: report.url });
  const plan = () =>
    reader.planReview({ id: session.id, profileId: profile.id });
  const apply = (proposed, fields, extra = {}) =>
    reader.applyReview({
      id: session.id,
      planId: proposed.reviewPlan.id,
      fields,
      ...extra,
    });
  return {
    reader,
    store,
    profile,
    report,
    writes,
    hooks,
    options,
    plan,
    apply,
    session,
    advance: () => {
      clock += 600001;
    },
    get disposed() {
      return disposed;
    },
    get closed() {
      return closed;
    },
  };
};

test(
  'review plans never write; selected-only changes require explicit existing-answer replacement and return readback',
  { timeout: 5000 },
  async (t) => {
    const env = await environment();
    t.after(() => env.reader.stop());
    const before = JSON.stringify(await env.store.query(() => true));
    const plan = await env.plan();
    assert.equal(
      plan.fields.filter((entry) => entry.answer.applySupported).length,
      3
    );
    assert.deepEqual(env.writes, []);
    await assert.rejects(env.apply(plan, ['frame-1:name']), {
      code: 'form-existing-value',
    });
    plan.fields[0].answer.proposal.value = 'Forged public result';
    const result = await env.apply(plan, ['frame-1:name'], {
      replaceExisting: true,
    });
    assert.equal(result.state, 'applied');
    assert.equal(result.receipts[0].status, 'applied');
    assert.equal(env.report.fields[0].value, 'Ada Example');
    assert.equal(env.report.fields[1].value, '');
    assert.equal(env.report.fields[2].value, '');
    assert.equal(JSON.stringify(await env.store.query(() => true)), before);
    assert.deepEqual(
      (await env.apply(plan, ['frame-1:name'])).receipts,
      result.receipts
    );
    assert.equal(env.writes.length, 1);
  }
);

test(
  'manual edits and replaced elements invalidate a held plan before any write',
  { timeout: 5000 },
  async (t) => {
    const env = await environment();
    t.after(() => env.reader.stop());
    let plan = await env.plan();
    env.report.fields[1].value = 'Manual newer answer';
    let result = await env.apply(plan, ['frame-1:email'], {
      replaceExisting: true,
    });
    assert.equal(result.state, 'refused');
    assert.equal(result.code, 'form-changed');
    assert.deepEqual(env.writes, []);
    plan = await env.plan();
    env.hooks.check = () => {
      throw Object.assign(new Error('detached'), { code: 'form-changed' });
    };
    result = await env.apply(plan, ['frame-1:email'], {
      replaceExisting: true,
    });
    assert.equal(result.code, 'form-changed');
    assert.deepEqual(env.writes, []);
  }
);

test(
  'profile changes refuse stale proposals and knowledge edits during filling stop remaining fields',
  { timeout: 5000 },
  async (t) => {
    const env = await environment();
    t.after(() => env.reader.stop());
    let plan = await env.plan();
    await saveAnswerProfile(env.store, {
      ...env.profile,
      values: { ...env.profile.values, email: 'new@example.test' },
    });
    let result = await env.apply(plan, ['frame-1:email']);
    assert.equal(result.state, 'refused');
    assert.equal(result.code, 'form-answers-changed');
    assert.deepEqual(env.writes, []);
    plan = await env.plan();
    env.hooks.afterWrite = async () =>
      saveAnswerRule(env.store, {
        id: 'experience',
        question: 'Experience',
        answers: [{ text: 'Changed answer', approved: true, count: 1 }],
      });
    result = await env.apply(plan, ['frame-1:email', 'frame-1:experience']);
    assert.equal(result.state, 'partial');
    assert.equal(result.code, 'form-answers-changed');
    assert.deepEqual(
      result.receipts.map((entry) => entry.status),
      ['applied', 'not-attempted']
    );
    assert.equal(env.report.fields[2].value, '');
  }
);

test(
  'owner edits during an awaited answer guard are checked before filling',
  { timeout: 5000 },
  async (t) => {
    const env = await environment();
    t.after(() => env.reader.stop());
    const plan = await env.plan();
    const scan = env.store.scan.bind(env.store);
    let release;
    let entered;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    env.store.scan = async (...args) => {
      entered();
      await held;
      return scan(...args);
    };
    const pending = env.apply(plan, ['frame-1:email']);
    await started;
    env.report.fields[1].value = 'Owner newer answer';
    release();
    const result = await pending;
    assert.equal(result.state, 'refused');
    assert.equal(result.code, 'form-changed');
    assert.deepEqual(env.writes, []);
    assert.equal(env.report.fields[1].value, 'Owner newer answer');
  }
);

test(
  'an issued write with an unknown result is recorded once and never replays',
  { timeout: 5000 },
  async (t) => {
    const env = await environment();
    t.after(() => env.reader.stop());
    const plan = await env.plan();
    env.hooks.write = async () => {
      env.report.fields[1].value = 'ada@example.test';
      throw new Error('connection lost after input');
    };
    const result = await env.apply(plan, [
      'frame-1:email',
      'frame-1:experience',
    ]);
    assert.equal(result.state, 'uncertain');
    assert.equal(result.receipts[0].status, 'uncertain');
    assert.equal(result.report.fields[1].value, 'ada@example.test');
    await env.apply(plan, ['frame-1:email', 'frame-1:experience']);
    assert.equal(env.writes.length, 1);
  }
);

test(
  'readback mismatch stops later writes and unchanged answers issue no interaction',
  { timeout: 5000 },
  async (t) => {
    const env = await environment();
    t.after(() => env.reader.stop());
    env.report.fields[1].value = 'ada@example.test';
    let plan = await env.plan();
    let result = await env.apply(plan, ['frame-1:email']);
    assert.equal(result.receipts[0].status, 'unchanged');
    assert.deepEqual(env.writes, []);
    plan = await env.plan();
    env.hooks.write = async () => {};
    result = await env.apply(plan, ['frame-1:experience']);
    assert.equal(result.state, 'uncertain');
    assert.equal(result.code, 'form-readback');
  }
);

test(
  'expiry, rereads and selection limits cannot authorize a write',
  { timeout: 5000 },
  async (t) => {
    const env = await environment();
    t.after(() => env.reader.stop());
    let plan = await env.plan();
    env.advance();
    await assert.rejects(env.apply(plan, ['frame-1:email']), {
      code: 'form-plan-expired',
    });
    plan = await env.plan();
    await env.reader.readReview(env.session.id);
    await assert.rejects(env.apply(plan, ['frame-1:email']), {
      code: 'form-plan-expired',
    });
    plan = await env.plan();
    for (const fields of [
      [],
      ['frame-1:email', 'frame-1:email'],
      ['missing'],
      Array(26).fill('field'),
    ]) {
      await assert.rejects(env.apply(plan, fields), { code: 'form-selection' });
    }
    assert.deepEqual(env.writes, []);
    assert(env.disposed >= 2);
  }
);

test('custom, mixed, protected and ambiguous choices remain unavailable for native prefilling', () => {
  const proposed = (extra) =>
    field('choice', 'Choice', {
      answer: { proposal: { value: 'yes', checked: true } },
      ...extra,
    });
  for (const extra of [
    { tag: 'div', type: 'checkbox' },
    { type: 'radio' },
    { type: 'password' },
    { type: 'checkbox', indeterminate: true },
    { readOnly: true },
    { disabled: true },
    { valueOmitted: 'password' },
    { tag: 'select', multiple: true },
    { tag: 'select', options: [{ value: 'yes' }, { value: 'yes' }] },
  ]) {
    assert.equal(writableReviewField(proposed(extra)), false);
  }
  assert.equal(
    writableReviewField(
      proposed({
        tag: 'select',
        options: [{ value: 'yes' }, { value: 'no' }],
      })
    ),
    true
  );
});

test(
  'shutdown owns an issued write and refuses a later field after cancellation',
  { timeout: 5000 },
  async () => {
    const env = await environment();
    let release;
    const held = new Promise((done) => {
      release = done;
    });
    let issued;
    const started = new Promise((done) => {
      issued = done;
    });
    const plan = await env.plan();
    env.hooks.write = async () => {
      issued();
      await held;
    };
    const apply = assert.rejects(
      env.apply(plan, ['frame-1:email', 'frame-1:experience']),
      { code: 'form-session-closed' }
    );
    await started;
    let stopped = false;
    const stop = env.reader.stop().then(() => {
      stopped = true;
    });
    await setImmediate();
    assert.equal(stopped, false);
    release();
    await Promise.all([apply, stop]);
    assert.equal(env.writes.length, 1);
    assert.equal(env.closed, 1);
  }
);

test(
  'text/binary Lino review plans and applications share trusted selection and cached receipts',
  { timeout: 10000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await environment();
      await env.reader.stop();
      const server = await startServer({
        ...env.options,
        port: 0,
        localUi: false,
        enableSync: false,
        enableHandlers: false,
        telegramAccount: false,
        automations: { scheduler: false },
        forms: { ...env.options },
        log: null,
      });
      const base = `http://127.0.0.1:${server.port}`;
      const post = async (action, body, headers = {}) =>
        readWireResponse(
          await fetch(`${base}/api/forms/sessions/${action}`, {
            method: 'POST',
            headers: { 'content-type': media, accept: media, ...headers },
            body: encodeWire(body, media),
          })
        );
      try {
        const opened = await post('open', { url: env.report.url });
        const plan = await post('plan', {
          id: opened.session.id,
          profileId: env.profile.id,
        });
        assert.equal(plan.mode, 'answer-plan');
        const body = {
          id: opened.session.id,
          planId: plan.reviewPlan.id,
          fields: ['frame-1:email'],
        };
        const forbidden = await post('apply', body, {
          origin: 'https://untrusted.example',
        });
        assert.equal(forbidden.code, 'forbidden');
        const result = await post('apply', body);
        assert.equal(result.state, 'applied');
        assert.deepEqual((await post('apply', body)).receipts, result.receipts);
        assert.equal(env.writes.length, 1);
        assert.equal(
          isReadRequest(`${base}/api/forms/sessions/apply`, 'POST'),
          false
        );
      } finally {
        await server.close();
      }
    }
  }
);

test(
  'interactive CLI plans the live page and applies only explicitly named fields',
  { timeout: 5000 },
  async () => {
    const env = await environment();
    await env.reader.stop();
    const output = [];
    let storeClosed = false;
    const commands = createFormsCommands({
      ...env.options,
      openStore: async () => ({
        ...env.store,
        close: async () => {
          storeClosed = true;
        },
      }),
      async *reviewInput() {
        yield 'plan form-1';
        const plan = output.find((entry) => entry.mode === 'answer-plan');
        yield `apply form-1 ${plan.reviewPlan.id} frame-1:email`;
        yield 'quit';
      },
    });
    assert.equal(
      await commands['forms-review'](
        { url: env.report.url, 'profile-id': env.profile.id },
        (line) => output.push(JSON.parse(line))
      ),
      0
    );
    assert(
      output.some(
        (entry) => entry.mode === 'apply-result' && entry.state === 'applied'
      )
    );
    assert.deepEqual(env.writes, ['frame-1:email']);
    assert(storeClosed);
  }
);
