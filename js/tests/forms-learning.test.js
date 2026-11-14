import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  saveAnswerRule,
  listAnswerRules,
} from '../src/automation/question-store.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import { formAnswerPairs } from '../src/forms/answer-pairs.js';
import { learnFormAnswerPairs } from '../src/forms/answer-learning.js';
import { createFormLearning } from '../src/forms/review-learning.js';
import { writeAnswerKnowledge } from '../src/automation/question-knowledge.js';
import { setImmediate } from 'node:timers/promises';

const field = (value = '', name = 'experience') => ({
  id: `frame-1:${name}`,
  frame: 'frame-1',
  index: 0,
  nativeId: name,
  name,
  label: name === 'experience' ? 'Describe recent experience' : name,
  type: 'textarea',
  value,
  valueOmitted: null,
  options: [],
  required: false,
  disabled: false,
  readOnly: false,
  checked: null,
});
const report = (value = '', page = 1) => ({
  url: `https://example.test/form?page=${page}`,
  capturedAt: new Date().toISOString(),
  fields: [field(value)],
  frames: [{ id: 'frame-1', url: `https://example.test/form?page=${page}` }],
});
const clock = () => {
  let time = 10000;
  let id = 0;
  const tasks = new Map();
  return {
    now: () => time,
    timers: {
      setTimeout: (run, delay) => {
        tasks.set(++id, { run, at: time + delay });
        return id;
      },
      clearTimeout: (key) => tasks.delete(key),
    },
    advance: async (delta) => {
      time += delta;
      for (const [key, task] of [...tasks]) {
        if (task.at <= time) {
          tasks.delete(key);
          task.run();
        }
      }
      await Promise.resolve();
    },
    remaining: () => [...tasks.values()].map((task) => task.at - time),
  };
};
const fixture = (options = {}) => {
  const timing = clock();
  const saved = [];
  let current = report();
  const learning = createFormLearning({
    ...timing,
    read: async () => current,
    save: async (pairs, details) => {
      await details.check();
      saved.push({ pairs, details });
      return { saved: pairs.length, skipped: 0 };
    },
    ...options,
  });
  const evidence = (extra = {}) => ({
    documentKey: 'fixture-document-1',
    frame: 'monitor-frame-1',
    edits: 0,
    editedAt: 0,
    intent: 0,
    confirmation: false,
    responseUrl: false,
    changes: [{ index: 0, at: extra.editedAt ?? 0 }],
    at: timing.now(),
    ...extra,
  });
  return {
    ...timing,
    learning,
    saved,
    evidence,
    arm: (value = '', page = 1) => {
      current = report(value, page);
      learning.arm(current);
    },
    observe: async (value, page = 1, extra = {}) => {
      current = report(value, page);
      await learning.observe(current, evidence(extra));
    },
    complete: async (extra = {}) => {
      current = { ...current, fields: [] };
      await learning.observe(current, evidence(extra));
    },
    setCurrent: (value) => {
      current = value;
    },
    advance: async (delta) => {
      await timing.advance(delta);
      await learning.settle();
    },
  };
};

test('actual text, selected option labels, dates and complete choice groups become pairs without proposal values or secrets', () => {
  const snapshot = report('Actual answer');
  snapshot.fields[0].answer = { text: 'Never learn this proposal' };
  snapshot.fields.push(
    {
      ...field('private', 'secret'),
      type: 'password',
      valueOmitted: 'password',
    },
    { ...field('2026-11-10', 'Start date'), type: 'date', index: 2 },
    {
      ...field('remote', 'Arrangement'),
      type: 'select',
      index: 3,
      options: [{ value: 'remote', label: 'Remote work', selected: true }],
    },
    ...['JS', 'Rust'].map((label, index) => ({
      ...field('on', label),
      type: 'checkbox',
      index: index + 4,
      checked: true,
      group: { id: 'skills', label: 'Skills' },
    })),
    {
      ...field('on', 'Incomplete radio'),
      type: 'radio',
      group: { id: 'r', label: 'Incomplete' },
      radioGroup: { id: 'r', complete: false },
      checked: true,
    }
  );
  assert.deepEqual(
    formAnswerPairs(snapshot).map(({ question, text }) => [question, text]),
    [
      ['Describe recent experience', 'Actual answer'],
      ['Start date', '2026-11-10'],
      ['Arrangement', 'Remote work'],
      ['Skills', 'JS, Rust'],
    ]
  );
});

test('form learning uses shared rejection/correction/privacy guards, contracts contacts and never approves or recounts known answers', async () => {
  const store = createMemoryStore();
  try {
    await saveAnswerProfile(store, {
      id: 'owner',
      name: 'Owner',
      values: { phone: '+1 202 555 0123' },
    });
    await saveAnswerPolicy(store, { rejected: ['Unwanted wording'] });
    await saveAnswerRule(store, {
      id: 'correction',
      question: 'Preferred location',
      answers: [
        { text: 'Remote only', approved: true, canonical: true, count: 2 },
      ],
    });
    const pairs = [
      [
        'Describe recent experience',
        'I build storage systems; contact +1 202 555 0123',
      ],
      ['Phone', '+1 202 555 0123'],
      ['Salary expectations', '100000'],
      ['Test assignment link', 'https://example.test/project'],
      ['Availability', '[clarify: date]'],
      ['Other experience', 'Unwanted wording'],
      ['Preferred location', 'Office daily'],
      ['Private access', 'https://example.test/private/token'],
      ['Question back', 'Can I start later?'],
    ].map(([question, text], index) => ({
      ...formAnswerPairs(report(text))[0],
      question,
      evidence: `form:test:${index}`,
    }));
    const result = await learnFormAnswerPairs(store, pairs, {
      profileId: 'owner',
    });
    assert.equal(result.saved, 1);
    const learned = (await listAnswerRules(store)).find(
      (rule) => rule.question === 'Describe recent experience'
    );
    assert.equal(
      learned.answers[0].text,
      'I build storage systems; contact {{phone}}'
    );
    assert.equal(learned.answers[0].approved, false);
    assert.equal(learned.answers[0].canonical, false);
    assert.equal(
      (await learnFormAnswerPairs(store, pairs, { profileId: 'owner' })).saved,
      0
    );
    assert.equal((await store.get(learned.id)).answers[0].count, 1);
    assert.equal(
      (await store.get('qa-rule:correction')).answers[0].canonical,
      true
    );
  } finally {
    await store.close?.();
  }
});

test('unchanged prefills and programmatic changes stay unlearned; owner edits must remain unchanged for a full minute and match live readback', async () => {
  const env = fixture();
  try {
    env.arm('Initial prefill');
    await env.observe('Script changed this');
    await env.advance(60000);
    assert.equal(env.saved.length, 0);
    await env.observe('Owner first edit', 1, { edits: 1, editedAt: env.now() });
    assert.deepEqual(env.remaining(), [60000]);
    await env.advance(59999);
    assert.equal(env.saved.length, 0);
    await env.observe('Owner final edit', 1, { edits: 2, editedAt: env.now() });
    await env.advance(59999);
    assert.equal(env.saved.length, 0);
    await env.advance(1);
    assert.equal(env.saved.length, 1);
    assert.equal(env.saved[0].pairs[0].text, 'Owner final edit');
    assert.equal(env.saved[0].details.kind, 'stable-owner-edit');
    await env.advance(60000);
    assert.equal(env.saved.length, 1);
    await env.observe('Another edit', 1, { edits: 3, editedAt: env.now() });
    env.setCurrent(report('Live newer value without a delivered snapshot'));
    await env.advance(60000);
    assert.equal(env.saved.length, 1);
  } finally {
    await env.learning.stop();
  }
});

test('confirmed application resets the baseline so the application itself is never learned as an owner correction', async () => {
  const env = fixture();
  try {
    env.arm();
    await env.observe('Applied proposed answer', 1, {
      edits: 1,
      editedAt: env.now(),
    });
    env.learning.applied({
      report: report('Applied proposed answer'),
      receipts: [{ fieldId: 'frame-1:experience', status: 'applied' }],
    });
    await env.advance(60000);
    assert.equal(env.saved.length, 0);
    await env.observe('Owner changed the prefill', 1, {
      edits: 2,
      editedAt: env.now(),
    });
    await env.advance(60000);
    assert.equal(env.saved.length, 1);
  } finally {
    await env.learning.stop();
  }
});

test('only post-intent completion in the submitting document learns actual values from all planned pages', async () => {
  const env = fixture();
  try {
    await env.complete({ confirmation: true });
    assert.equal(env.saved.length, 0, 'unplanned confirmation is inert');
    env.arm('', 1);
    await env.observe('First owner answer', 1, {
      edits: 1,
      editedAt: env.now(),
    });
    env.arm('', 2);
    await env.observe('Second owner answer', 2, {
      edits: 1,
      editedAt: env.now(),
    });
    await env.observe('Second owner answer', 2, { intent: 1 });
    assert.equal(
      env.saved.length,
      0,
      'send intent with the form still present proves no completion'
    );
    await env.complete({ frame: 'unrelated-frame', confirmation: true });
    assert.equal(env.saved.length, 0);
    await env.complete({ confirmation: true, responseStatus: 500 });
    assert.equal(env.saved.length, 0);
    await env.complete({ confirmation: true, responseStatus: 200 });
    assert.equal(env.saved.length, 1);
    assert.deepEqual(
      env.saved[0].pairs.map((pair) => pair.text),
      ['First owner answer', 'Second owner answer']
    );
    await env.complete({ confirmation: true });
    assert.equal(
      env.saved.length,
      1,
      'repeated confirmation has no new intent'
    );
  } finally {
    await env.learning.stop();
  }
});

test('expired intent, changed-back edits, incomplete capture, opt-out and stop cannot save answers', async () => {
  const env = fixture();
  try {
    env.arm('Initial');
    await env.observe('Initial', 1, { intent: 1 });
    await env.advance(120001);
    await env.complete({ responseUrl: true });
    assert.equal(env.saved.length, 0);
    await env.observe('Changed', 1, { edits: 1, editedAt: env.now() });
    await env.observe('Initial', 1, { edits: 2, editedAt: env.now() });
    await env.advance(60000);
    assert.equal(env.saved.length, 0);
    await env.observe('Changed again', 1, { edits: 3, editedAt: env.now() });
    env.learning.incomplete('capture-omitted');
    await env.advance(60000);
    assert.equal(env.saved.length, 0);
    assert.equal(env.learning.status().state, 'incomplete');
    assert.equal(env.learning.status().tracked, 0);
    await env.learning.stop();
    await env.observe('After close', 1, {
      edits: 4,
      intent: 2,
      confirmation: true,
    });
    assert.equal(env.saved.length, 0);
    const disabled = fixture({ enabled: false });
    disabled.arm();
    await disabled.observe('Never saved', 1, { intent: 1, confirmation: true });
    assert.equal(disabled.learning.status().state, 'disabled');
    await disabled.learning.stop();
  } finally {
    await env.learning.stop();
  }
});

test('an owner edit cannot turn a concurrent script change in another field into an owner correction', async () => {
  const env = fixture();
  try {
    const snapshot = report('Initial');
    snapshot.fields.push({ ...field('Old', 'Other detail'), index: 1 });
    env.learning.arm(snapshot);
    snapshot.fields[0].value = 'Owner edit';
    snapshot.fields[1].value = 'Script edit';
    env.setCurrent(snapshot);
    await env.learning.observe(
      snapshot,
      env.evidence({ edits: 1, editedAt: env.now() })
    );
    await env.advance(60000);
    assert.deepEqual(
      env.saved[0].pairs.map((pair) => pair.text),
      ['Owner edit']
    );
  } finally {
    await env.learning.stop();
  }
});

test(
  'a stable answer is re-read after the knowledge writer wait, before storage',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    let release;
    const held = writeAnswerKnowledge(
      store,
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    await setImmediate();
    const env = fixture({
      save: (pairs, options) => learnFormAnswerPairs(store, pairs, options),
    });
    try {
      env.arm('Prefill');
      await env.observe('Owner answer before storage wait', 1, {
        edits: 1,
        editedAt: env.now(),
      });
      const stable = env.advance(60000);
      await setImmediate();
      env.setCurrent(report('Undelivered newer edit'));
      release();
      await Promise.all([held, stable]);
      assert.deepEqual(await listAnswerRules(store), []);
      assert.equal(env.learning.status().error, 'form-learning-changed');
    } finally {
      release();
      await held;
      await env.learning.stop();
    }
  }
);

test(
  'queued learning reads the latest rejected policy and profile and capacity failures write nothing',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const initial = await saveAnswerProfile(store, {
      id: 'owner',
      name: 'Owner',
      values: { phone: '+1 202 555 0100' },
    });
    let release;
    const held = writeAnswerKnowledge(
      store,
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    await setImmediate();
    const policy = saveAnswerPolicy(store, { rejected: ['Recently rejected'] });
    const profile = saveAnswerProfile(store, {
      id: 'owner',
      name: 'Owner',
      revision: initial.revision,
      values: { phone: '+1 202 555 0123' },
    });
    const pairs = ['Recently rejected', 'My contact is +1 202 555 0123'].map(
      (text, index) => ({
        ...formAnswerPairs(report(text))[0],
        question: `Experience ${index}`,
        evidence: `queue:${index}`,
      })
    );
    const saving = learnFormAnswerPairs(store, pairs, { profileId: 'owner' });
    release();
    await Promise.all([held, policy, profile, saving]);
    const rules = await listAnswerRules(store);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].answers[0].text, 'My contact is {{phone}}');
    const before = JSON.stringify(rules);
    await assert.rejects(
      learnFormAnswerPairs(store, Array(1001).fill(pairs[0])),
      /capacity/
    );
    assert.equal(JSON.stringify(await listAnswerRules(store)), before);
  }
);

test(
  'partial storage failure reports only confirmed proposal writes and bounded retries stop after three failures',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const put = store.put.bind(store);
    let writes = 0;
    store.put = async (value) => {
      if (++writes === 2) {
        throw new Error('disk unavailable');
      }
      return put(value);
    };
    const pairs = ['First experience', 'Second experience'].map(
      (question, index) => ({
        ...formAnswerPairs(report('A sufficient actual answer'))[0],
        question,
        evidence: `partial:${index}`,
      })
    );
    await assert.rejects(learnFormAnswerPairs(store, pairs), (error) => {
      assert.equal(error.partial.saved, 1);
      assert.equal(error.partial.rules.length, 1);
      assert.equal(error.partial.approved, false);
      return true;
    });
    assert.equal((await listAnswerRules(store)).length, 1);
    const env = fixture({
      save: async () => {
        throw new Error('disk unavailable');
      },
    });
    try {
      env.arm();
      await env.observe('Stable owner answer', 1, {
        edits: 1,
        editedAt: env.now(),
      });
      await env.advance(60000);
      await env.advance(1000);
      await env.advance(1000);
      assert.equal(env.learning.status().failed, 3);
      assert.equal(env.learning.status().state, 'failed');
      assert.equal(env.learning.status().saved, 0);
      assert.deepEqual(env.remaining(), []);
    } finally {
      await env.learning.stop();
    }
  }
);

test(
  'review operations pause automatic learning, then resume the stable baseline without learning application changes',
  { timeout: 5000 },
  async () => {
    const env = fixture();
    try {
      env.arm('Prefill');
      await env.observe('Owner changed this', 1, {
        edits: 1,
        editedAt: env.now(),
      });
      await env.learning.pause(true);
      await env.advance(60000);
      assert.equal(env.saved.length, 0);
      await env.learning.pause(false);
      await env.advance(1);
      assert.equal(env.saved.length, 1);
    } finally {
      await env.learning.stop();
    }
  }
);

test(
  'temporary store-owner contention delays retries without disabling the watcher or claiming a saved answer',
  { timeout: 5000 },
  async () => {
    let busy = true;
    const env = fixture({
      save: async (pairs, options) => {
        await options.check();
        if (busy) {
          throw Object.assign(new Error('writer busy'), {
            code: 'form-store-busy',
          });
        }
        return { saved: pairs.length, skipped: 0 };
      },
    });
    try {
      env.arm();
      await env.observe('Owner answer waits for its writer', 1, {
        edits: 1,
        editedAt: env.now(),
      });
      await env.advance(60000);
      for (let attempt = 0; attempt < 4; attempt++) {
        await env.advance(5000);
      }
      assert.equal(env.learning.status().state, 'watching');
      assert.equal(env.learning.status().saved, 0);
      assert.equal(env.learning.status().failed, 0);
      assert.equal(env.learning.status().error, 'form-store-busy');
      busy = false;
      await env.advance(5000);
      assert.equal(env.learning.status().saved, 1);
      assert.equal(env.learning.status().error, null);
    } finally {
      await env.learning.stop();
    }
  }
);
