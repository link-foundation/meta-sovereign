import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planFormAnswers, createFormReader } from '../src/forms/reader.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { startServer } from '../src/server/index.js';
import {
  encodeLinoValue,
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { isReadRequest } from '../src/web/request-policy.js';

const field = (label, input = {}) => ({
  id: `frame-1:${label}`,
  frame: 'frame-1',
  label,
  labelSource: 'label',
  type: 'text',
  description: '',
  value: '',
  valueOmitted: null,
  checked: null,
  options: [],
  required: false,
  disabled: false,
  readOnly: false,
  ...input,
});
const inspection = (fields) => ({
  ok: true,
  version: 1,
  mode: 'read-only',
  url: 'https://example.test/application',
  title: 'Application',
  capturedAt: '2026-11-10T14:00:00Z',
  scope: 'visible-current-pages',
  coverage: 'inspected',
  frames: [
    {
      id: 'frame-1',
      parent: null,
      url: 'https://example.test/application',
      reasons: [],
    },
  ],
  omissions: [],
  fields,
  targetLifetime: 'snapshot-only',
});
const rule = (id, question, text, extra = {}) => ({
  id,
  question,
  answers: [{ text, count: 2, approved: true, evidence: ['reviewed-fixture'] }],
  ...extra,
});
const plan = (store, fields, input = {}) =>
  planFormAnswers(store, { inspection: inspection(fields), ...input });

test('form proposals resolve the current named profile and preserve existing answers without learning', async () => {
  const store = createMemoryStore();
  const owner = await saveAnswerProfile(store, {
    id: 'owner',
    name: 'Owner',
    values: { name: 'Ada Example', email: 'old@example.test' },
  });
  const updated = await saveAnswerProfile(store, {
    ...owner,
    values: { ...owner.values, email: 'new@example.test' },
  });
  const before = JSON.stringify(await store.query(() => true));
  let scans = 0;
  const result = await plan(
    {
      ...store,
      scan: async (...args) => {
        scans++;
        return store.scan(...args);
      },
    },
    [
      field('Full name', { value: 'Current owner answer' }),
      field('Email', { type: 'email' }),
      field('LinkedIn profile'),
      field('Company email', { type: 'email' }),
      field('Have you used LinkedIn?'),
      field('First name'),
    ],
    { profileId: owner.id, profile: { name: 'Explicit Override' } }
  );
  assert.equal(scans, 1, 'answer knowledge read once for the batch');
  const [name, email, linkedin, company, boolean, first] = result.fields.map(
    (item) => item.answer
  );
  assert.deepEqual(name.proposal, { value: 'Explicit Override' });
  assert.equal(name.source, 'profile');
  assert.equal(name.preserveCurrent, true);
  assert.equal(name.requiresReview, true);
  assert.deepEqual(email.proposal, { value: 'new@example.test' });
  assert.equal(result.planning.profileSource.revision, updated.revision);
  assert.deepEqual(result.planning.profileSource.overriddenKeys, ['name']);
  assert.deepEqual(linkedin.missing, ['linkedin']);
  assert.equal(linkedin.proposal, null);
  assert.equal(
    first.proposal,
    null,
    'a first name is never guessed by splitting a full name'
  );
  assert.equal(company.proposal, null);
  assert.equal(
    boolean.proposal,
    null,
    'a boolean question must not be replaced by a link'
  );
  assert.equal(JSON.stringify(await store.query(() => true)), before);
  assert.equal(result.planning.model.used, false);
});

test('form labels reuse scoped, exact and approximate saved answers with source evidence and rejected wording', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(
    store,
    rule('experience', 'Recent experience', 'JavaScript and Rust')
  );
  await saveAnswerRule(
    store,
    rule('scoped', 'Preferred stack', 'Rust', {
      sources: ['hh'],
      chats: ['hh:vacancy-1'],
    })
  );
  await saveAnswerRule(
    store,
    rule(
      'approx',
      'Describe recent backend development experience',
      'Reviewed backend work'
    )
  );
  let result = await plan(store, [
    field('Recent experience'),
    field('Preferred stack'),
    field('Describe your recent backend development experience'),
  ]);
  const [exact, scoped, approximate] = result.fields.map((item) => item.answer);
  assert.equal(exact.source, 'exact');
  assert.equal(exact.similarity, 1);
  assert.equal(exact.rules[0].question, 'Recent experience');
  assert.deepEqual(exact.evidence, ['reviewed-fixture']);
  assert.equal(scoped.proposal, null);
  assert.equal(approximate.source, 'approximate');
  assert(approximate.similarity >= 0.78 && approximate.similarity < 1);
  assert.equal(approximate.requiresReview, true);
  result = await plan(store, [field('Preferred stack')], {
    source: 'hh',
    chat: 'vacancy-1',
  });
  assert.equal(result.fields[0].answer.text, 'Rust');
  await saveAnswerPolicy(store, { rejected: ['Rust'] });
  assert.equal(
    (await plan(store, [field('Recent experience')])).fields[0].answer.proposal,
    null
  );
  assert.equal(
    (
      await plan(
        store,
        [field('Describe your recent backend development experience')],
        { approximate: false }
      )
    ).fields[0].answer.proposal,
    null
  );
});

test('contact words in boolean controls use saved choices rather than owner contact values', async () => {
  const store = createMemoryStore();
  const owner = await saveAnswerProfile(store, {
    id: 'owner',
    name: 'Owner',
    values: { email: 'ada@example.test', github: 'https://github.com/example' },
  });
  await saveAnswerRule(store, rule('updates', 'Receive email updates', 'Yes'));
  await saveAnswerRule(store, rule('github', 'GitHub', 'No'));
  const result = await plan(
    store,
    [
      field('Receive email updates', { type: 'checkbox' }),
      field('GitHub', { type: 'checkbox' }),
    ],
    { profileId: owner.id }
  );
  assert.deepEqual(
    result.fields.map((entry) => entry.answer.proposal),
    [{ checked: true }, { checked: false }]
  );
  assert(result.fields.every((entry) => entry.answer.source === 'exact'));
});

test('choices are unique and enabled, radio groups stay separate, and multiple checkboxes require explicit selected labels', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(
    store,
    rule('arrangement', 'Work arrangement', 'Remote')
  );
  await saveAnswerRule(store, rule('tools', 'Tools', 'Rust\nJavaScript'));
  const option = (label, value = label, disabled = false) => ({
    label,
    value,
    disabled,
  });
  const fields = [
    field('Work arrangement', {
      type: 'select',
      options: [option('Remote', 'remote-id'), option('Office')],
    }),
    field('Work arrangement', {
      id: 'duplicate',
      type: 'select',
      options: [option('Remote', '1'), option('Remote', '2')],
    }),
    field('Work arrangement', {
      id: 'disabled',
      type: 'select',
      options: [option('Remote', '1', true)],
    }),
    ...['one', 'two'].flatMap((id) =>
      ['Remote', 'Office'].map((label) =>
        field(label, {
          id: `${id}-${label}`,
          type: 'radio',
          checked: false,
          group: { id, label: 'Work arrangement' },
        })
      )
    ),
    ...['Rust', 'JavaScript', 'Python'].map((label) =>
      field(label, {
        type: 'checkbox',
        checked: false,
        group: { id: 'tools', label: 'Tools' },
      })
    ),
  ];
  const result = await plan(store, fields);
  const answers = result.fields.map((item) => item.answer);
  assert.deepEqual(answers[0].proposal, {
    value: 'remote-id',
    option: 'Remote',
  });
  assert.equal(answers[1].proposal, null);
  assert.equal(answers[2].proposal, null);
  assert.deepEqual(
    answers.slice(3, 7).map((item) => item.proposal.checked),
    [true, false, true, false]
  );
  assert.deepEqual(
    answers.slice(7).map((item) => item.proposal.checked),
    [true, true, false]
  );
});

test('protected controls, missing substitutions and incompatible formats remain unresolved', async () => {
  const store = createMemoryStore();
  for (const [id, question, answer] of [
    ['date', 'Start date', '2026-02-30'],
    ['count', 'Years of experience', 'about five'],
    ['missing', 'Main skill', '{{skill}}'],
    ['range', 'Range', '7'],
    ['email', 'Contact email', `${'x'.repeat(255)}@example.test`],
    ['url', 'Portfolio URL', 'https://example.test'],
  ]) {
    await saveAnswerRule(store, rule(id, question, answer));
  }
  const result = await plan(store, [
    field('Start date', { type: 'date' }),
    field('Years of experience', { type: 'number' }),
    field('Main skill'),
    field('Range', { type: 'range' }),
    field('Password', {
      type: 'password',
      value: null,
      valueOmitted: 'password',
    }),
    field('Resume', { type: 'file', value: null, valueOmitted: 'file' }),
    field('Locked', { readOnly: true }),
    field('Mixed', { type: 'checkbox', indeterminate: true }),
  ]);
  assert(result.fields.every((item) => item.answer.proposal === null));
  assert.deepEqual(result.fields[2].answer.missing, ['skill']);
  assert(
    result.fields
      .slice(4)
      .every((item) => item.answer.reason === 'protected-field')
  );
  const credentialUrl = new URL('https://example.test');
  credentialUrl.username = 'synthetic-user';
  await saveAnswerRule(store, rule('url', 'Portfolio URL', credentialUrl.href));
  const invalidFormats = await plan(store, [
    field('Contact email', { type: 'email' }),
    field('Portfolio URL', { type: 'url' }),
  ]);
  assert(invalidFormats.fields.every((item) => item.answer.proposal === null));
});

test('malformed, duplicate and oversized reports refuse before reading private knowledge; srcdoc children are accepted', async () => {
  let reads = 0;
  const store = {
    scan: async () => {
      reads++;
    },
    get: async () => null,
  };
  for (const change of [
    { frames: [null] },
    { frames: [{ id: 'f', url: 'file:///private', reasons: [] }] },
    { fields: [null] },
    { fields: [field('Test', { options: [null] })] },
    { fields: [field('Test', { multiple: 'false' })] },
    { fields: [field('Test', { indeterminate: 'false' })] },
    { fields: [field('Same'), field('Same')] },
    { fields: Array.from({ length: 201 }, (_, i) => field(String(i))) },
    { extra: 'x'.repeat(2 * 1024 ** 2) },
  ]) {
    await assert.rejects(
      planFormAnswers(store, { inspection: { ...inspection([]), ...change } }),
      { code: 'form-report' }
    );
  }
  assert.equal(reads, 0);
  const snapshot = inspection([]);
  snapshot.frames.push({
    id: 'child',
    parent: 'frame-1',
    url: 'about:srcdoc',
    reasons: [],
  });
  assert.equal(
    (await planFormAnswers(store, { inspection: snapshot })).mode,
    'answer-plan'
  );
});

test('finite similarity work leaves a partial proposal unresolved and keeps later exact matches', async () => {
  const store = createMemoryStore();
  const words = Array.from({ length: 256 }, (_, i) => `w${i}`);
  for (let i = 0; i < 65; i++) {
    const pattern = [
      ...words.slice(0, 201),
      ...Array.from({ length: 55 }, (_, j) => `different${i}x${j}`),
    ].join(' ');
    await saveAnswerRule(
      store,
      rule(`bounded-${i}`, pattern, 'Reviewed answer')
    );
  }
  await saveAnswerRule(store, rule('last', 'Short label', 'Exact answer'));
  const result = await plan(store, [
    field(words.join(' '), { id: 'long-label' }),
    field('Short label'),
  ]);
  assert.equal(result.fields[0].answer.proposal, null);
  assert.equal(result.fields[0].answer.reason, 'planning-limit');
  assert.deepEqual(result.fields[1].answer.proposal, { value: 'Exact answer' });
  assert.equal(result.planning.limited, 1);
});

test('oversized stored answer knowledge refuses rather than applying a partial snapshot', async () => {
  const large = rule('qa-rule:large', 'Question', 'x'.repeat(12000));
  large.answers = Array.from({ length: 100 }, () => large.answers[0]);
  const store = {
    scan: async (_select, _size, consume) =>
      consume([large, { ...large, id: 'qa-rule:large2' }]),
  };
  await assert.rejects(plan(store, [field('Question')]), /capacity exceeded/u);
});

test('Forms planning CLI closes its store after successful and rejected input without opening browsers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forms-plan-'));
  const store = createMemoryStore();
  let closed = 0;
  const commands = createFormsCommands({
    openStore: async () => ({
      ...store,
      close: async () => {
        closed++;
      },
    }),
    openSession: () => assert.fail('planning never opens a browser'),
  });
  try {
    const file = join(dir, 'report.json');
    await writeFile(
      file,
      JSON.stringify(inspection([field('Email', { type: 'email' })]))
    );
    const output = [];
    assert.equal(
      await commands['forms-plan'](
        { file, profile: encodeLinoValue({ email: 'cli@example.test' }) },
        (value) => output.push(JSON.parse(value))
      ),
      0
    );
    assert.equal(output[0].fields[0].answer.proposal.value, 'cli@example.test');
    await writeFile(file, JSON.stringify({ ok: true }));
    await assert.rejects(
      commands['forms-plan']({ file }, () => {}),
      { code: 'form-report' }
    );
    assert.equal(closed, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'text and binary Lino planning share trusted-origin checks and remain available without a browser',
  { timeout: 15000 },
  async () => {
    let opened = 0;
    const store = createMemoryStore();
    const server = await startServer({
      store,
      port: 0,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false },
      forms: {
        availability: async () => ({ available: false }),
        openSession: () => {
          opened++;
        },
      },
    });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      assert.equal(
        (await readWireResponse(await fetch(`${base}/api/forms/capabilities`)))
          .plan,
        true
      );
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(`${base}/api/forms/plan`, {
          method: 'POST',
          headers: { accept: type, 'content-type': type },
          body: encodeWire(
            {
              inspection: inspection([field('Email', { type: 'email' })]),
              profile: { email: 'api@example.test' },
            },
            type
          ),
        });
        assert.equal(response.status, 200);
        assert.equal(
          (await readWireResponse(response)).fields[0].answer.proposal.value,
          'api@example.test'
        );
      }
      const refusal = await fetch(`${base}/api/forms/plan`, {
        method: 'POST',
        headers: {
          origin: 'https://untrusted.example',
          'content-type': LINO_TEXT,
        },
        body: encodeWire({ inspection: inspection([]) }, LINO_TEXT),
      });
      assert.equal(refusal.status, 403);
      assert.equal(opened, 0);
      assert.equal(
        isReadRequest('/api/forms/plan', 'POST'),
        false,
        'no implicit repeat after a planning timeout'
      );
    } finally {
      await server.close();
    }
  }
);

test('stopped Form readers refuse a new plan', async () => {
  const reader = createFormReader({ store: createMemoryStore() });
  await reader.stop();
  await assert.rejects(reader.plan({ inspection: inspection([]) }), {
    code: 'form-stopped',
  });
});

test(
  'shutdown owns an issued plan and concurrent plans refuse before loading more knowledge',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let started;
    const issued = new Promise((resolve) => {
      started = resolve;
    });
    const reader = createFormReader({
      store: {
        ...store,
        scan: async (...args) => {
          started();
          await held;
          return store.scan(...args);
        },
      },
    });
    const pending = reader.plan({ inspection: inspection([]) });
    await issued;
    await assert.rejects(reader.plan({ inspection: inspection([]) }), {
      code: 'form-busy',
    });
    let stopped = false;
    const stop = reader.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    assert.equal(stopped, false);
    await assert.rejects(reader.plan({ inspection: inspection([]) }), {
      code: 'form-stopped',
    });
    release();
    assert.equal((await pending).mode, 'answer-plan');
    await stop;
    assert.equal(stopped, true);
  }
);

test('salary plans retain structured calculations and use an explicit numeric amount for number fields', async () => {
  const result = await plan(
    createMemoryStore(),
    [field('Salary expectations in USD net per month', { type: 'number' })],
    {
      salary: {
        enabled: true,
        approved: true,
        exchangeMode: 'snapshot',
        defaultCurrency: 'USD',
        defaultBasis: 'net',
        monthlyHours: 160,
        currencies: [
          {
            code: 'USD',
            keywords: ['USD', '$'],
            net: 6000,
            gross: 7100,
            hourlyStep: 5,
          },
        ],
      },
    }
  );
  const answer = result.fields[0].answer;
  assert.equal(answer.source, 'salary');
  assert.deepEqual(answer.proposal, { value: '6000' });
  assert.equal(answer.salary.amount, 6000);
  assert.equal(answer.salary.currency, 'USD');
});

test('saved-answers-only planning can reuse a contact rule without inventing an owner profile', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, rule('email', 'Email', 'reviewed@example.test'));
  const result = await plan(store, [field('Email', { type: 'email' })]);
  assert.equal(result.fields[0].answer.source, 'exact');
  assert.deepEqual(result.fields[0].answer.proposal, {
    value: 'reviewed@example.test',
  });
});
