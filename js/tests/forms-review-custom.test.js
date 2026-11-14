import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { seedFormAnswers } from '../../experiments/issue-56/forms-plan-fixture.mjs';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { withRadioReview } from '../src/forms/review-radio.js';
import {
  writableReviewField,
  writeReviewTarget,
} from '../src/forms/review-targets.js';
import {
  applyReviewedFields,
  selectedReviewFields,
} from '../src/forms/review-apply.js';

const field = (id, type, label, extra = {}) => ({
  id,
  type,
  label,
  frame: 'frame-1',
  index: 0,
  tag: 'div',
  labelSource: 'aria-label',
  required: false,
  disabled: false,
  readOnly: false,
  indeterminate: false,
  valueOmitted: null,
  value: '',
  checked: null,
  options: [],
  custom: { editable: false, clickable: true, checkedKnown: true },
  ...extra,
});
const choices = () => [
  {
    label: 'Hindi',
    value: 'hi',
    selected: true,
    disabled: false,
    visible: true,
    clickable: true,
    index: 0,
  },
  {
    label: 'English',
    value: 'en',
    selected: false,
    disabled: false,
    visible: true,
    clickable: true,
    index: 1,
  },
];
const environment = async () => {
  const store = createMemoryStore();
  const profile = await seedFormAnswers(store);
  const report = {
    ok: true,
    version: 1,
    mode: 'read-only',
    targetLifetime: 'snapshot-only',
    scope: 'visible-current-pages',
    coverage: 'inspected',
    url: 'https://example.test/custom',
    title: 'Custom form',
    capturedAt: '2026-11-10T16:00:00Z',
    omissions: [],
    frames: [
      {
        id: 'frame-1',
        parent: null,
        url: 'https://example.test/custom',
        reasons: [],
      },
    ],
    fields: [
      field('text', 'textbox', 'Full name', {
        custom: { editable: true, clickable: true, checkedKnown: false },
      }),
      field('checkbox', 'checkbox', 'Receive email updates', {
        checked: false,
      }),
      ...['Remote', 'Office'].map((label, index) =>
        field(label.toLowerCase(), 'radio', label, {
          checked: index === 1,
          group: { id: 'work', label: 'Work arrangement' },
          radioGroup: { id: 'aria-work', size: 2, complete: true },
        })
      ),
      ...['listbox', 'combobox'].map((type) =>
        field(type, type, 'Preferred language', {
          value: 'hi',
          displayValue: 'Hindi',
          options: choices(),
          optionsComplete: true,
        })
      ),
    ],
  };
  const plan = async () =>
    withRadioReview(
      await planFormAnswers(store, {
        inspection: report,
        profileId: profile.id,
      })
    );
  const writes = [];
  const write = async (_browser, _handle, proposed) => {
    writes.push(proposed.id);
    const current = report.fields.find((entry) => entry.id === proposed.id);
    const proposal = proposed.answer.proposal;
    if (proposal.checked !== undefined) {
      current.checked = proposal.checked;
      for (const id of proposed.answer.radioPeers ?? []) {
        report.fields.find((entry) => entry.id === id).checked =
          id === proposed.id;
      }
    } else {
      current.value = proposal.value;
      if (current.optionsComplete) {
        current.displayValue = proposal.option;
        for (const option of current.options) {
          option.selected = option.value === proposal.value;
          if (current.type === 'combobox') {
            option.visible = false;
          }
        }
      }
    }
  };
  const apply = async (proposed, ids, replacement = write) =>
    applyReviewedFields({
      record: {},
      state: {
        id: 'review',
        inspection: globalThis.structuredClone(report),
        targets: { get: (id) => id, check: async () => {} },
      },
      fields: selectedReviewFields(proposed, {
        fields: ids,
        replaceExisting: true,
      }),
      fresh: async () => globalThis.structuredClone(report),
      guard: async () => {},
      check: () => {},
      write: replacement,
    });
  return { report, plan, apply, write, writes };
};

test('exposed ARIA controls share actual answer planning and complete-group review', async () => {
  const env = await environment();
  const plan = await env.plan();
  assert.deepEqual(
    plan.fields.filter(writableReviewField).map((entry) => entry.id),
    ['text', 'checkbox', 'remote', 'listbox', 'combobox']
  );
  assert.deepEqual(plan.fields[2].answer.effects, [
    { fieldId: 'office', label: 'Office', checked: false },
  ]);
  const result = await env.apply(plan, [
    'text',
    'checkbox',
    'remote',
    'listbox',
    'combobox',
  ]);
  assert.equal(result.state, 'applied');
  assert.ok(result.receipts.every((receipt) => receipt.status === 'applied'));
  assert.equal(result.receipts[2].effects[0].status, 'applied');
  assert.equal(env.report.fields[3].checked, false);
  assert.equal(env.report.fields[4].value, 'en');
  assert.equal(env.report.fields[5].options[0].visible, false);
});

test('incomplete custom groups and unknown checked state never become writable', async () => {
  for (const mutate of [
    (report) => {
      report.fields[3].radioGroup.complete = false;
    },
    (report) => {
      report.fields[3].custom.checkedKnown = false;
    },
    (report) => {
      report.fields[2].radioGroup.size = 3;
    },
    (report) => {
      report.fields[3].custom.clickable = false;
    },
  ]) {
    const env = await environment();
    mutate(env.report);
    assert.equal(writableReviewField((await env.plan()).fields[2]), false);
  }
  const env = await environment();
  env.report.fields[1].custom.checkedKnown = false;
  env.report.fields[0].custom.editable = false;
  const plan = await env.plan();
  assert.equal(writableReviewField(plan.fields[0]), false);
  assert.equal(writableReviewField(plan.fields[1]), false);
});

test('hidden, duplicate, protected and truncated custom choices remain unavailable', async () => {
  for (const mutate of [
    (field) => {
      field.options[1].visible = false;
    },
    (field) => {
      field.options[1].clickable = false;
    },
    (field) => {
      delete field.options[1].index;
    },
    (field) => {
      field.optionsComplete = false;
    },
    (field) => {
      field.options[0].value = 'en';
    },
    (field) => {
      field.multiple = true;
    },
  ]) {
    const env = await environment();
    mutate(env.report.fields[4]);
    const proposed = (await env.plan()).fields[4];
    assert.equal(writableReviewField(proposed), false);
  }
});

test('inconsistent custom selection readback stays uncertain and stops remaining fields', async () => {
  const env = await environment();
  const plan = await env.plan();
  const result = await env.apply(plan, ['listbox', 'checkbox'], async () => {
    env.report.fields[4].value = 'en';
  });
  assert.equal(result.state, 'uncertain');
  assert.equal(result.receipts[0].status, 'uncertain');
  assert.equal(result.receipts[1].status, 'not-attempted');
  assert.equal(env.report.fields[1].checked, false);
});

test('custom writes click the private choice, while editable text uses Commander', async () => {
  const env = await environment();
  const plan = await env.plan();
  const clicks = [];
  const fills = [];
  const browser = { commander: { performFill: (input) => fills.push(input) } };
  const handle = { click: (options) => clicks.push(options) };
  for (const id of ['checkbox', 'remote', 'listbox', 'combobox']) {
    await writeReviewTarget(
      browser,
      handle,
      plan.fields.find((entry) => entry.id === id)
    );
  }
  await writeReviewTarget(browser, handle, plan.fields[0]);
  assert.equal(clicks.length, 4);
  assert.ok(clicks.every((options) => options.timeout === 5000));
  assert.equal(fills.length, 1);
  assert.equal(fills[0].locatorOrElement, handle);
  assert.equal(fills[0].text, 'Ada Example');
});
