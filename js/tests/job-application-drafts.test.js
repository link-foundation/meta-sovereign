import test from 'node:test';
import assert from 'node:assert/strict';
import { createVacancyService } from '../src/jobs/service.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { applicationDraftFixture } from '../../experiments/issue-56/application-draft-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { formModelField } from './helpers/forms-plan-inspection.mjs';

const identity = (receipt, extra = {}) => ({
  ...applicationInput,
  revision: receipt.revision,
  confirm: true,
  ...extra,
});
const read = (fixture, receipt) =>
  fixture.service['application-read'](identity(receipt));
const backup = (fixture, receipt) =>
  fixture.service['application-backup'](identity(receipt));
const restore = (fixture, receipt) =>
  fixture.service['application-restore'](identity(receipt));
const ownerAnswers = (fixture) => {
  fixture.state.fields[1].value = 'Owner-only recent work.';
  fixture.state.fields[2].value = 'Actual edited letter.';
};
const savedDraft = async (fixture) => {
  const receipt = await fixture.enter();
  ownerAnswers(fixture);
  return backup(fixture, await read(fixture, receipt));
};
const empty = (fixture) => {
  fixture.state.fields[1].value = '';
  fixture.state.fields[2].value = '';
};
const choiceAnswers = (fixture) => {
  const group = { id: 'arrangement', complete: true, size: 2 };
  fixture.state.fields.push(
    formModelField('Consent', {
      tag: 'input',
      type: 'checkbox',
      index: 3,
      value: 'yes',
      checked: true,
    }),
    formModelField('Preferred shift', {
      tag: 'select',
      type: 'select',
      index: 4,
      value: 'day',
      options: ['', 'day', 'night'].map((value, index) => ({
        label: value || 'Choose',
        value,
        index,
        disabled: false,
        selected: value === 'day',
      })),
    }),
    ...['Remote', 'Office'].map((label, index) =>
      formModelField(label, {
        tag: 'input',
        type: 'radio',
        index: 5 + index,
        value: label.toLowerCase(),
        checked: index === 0,
        radioGroup: group,
      })
    )
  );
};

test(
  'native checkbox, select and complete radio choices restore without changing their option identity',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await fixture.enter();
      ownerAnswers(fixture);
      choiceAnswers(fixture);
      receipt = await backup(fixture, await read(fixture, receipt));
      const expected = globalThis.structuredClone(fixture.state.fields);
      await fixture.service.stop();
      fixture.service = createVacancyService(fixture.serviceOptions);
      receipt = await fixture.service['application-open']({
        ...applicationInput,
        recover: true,
      });
      const select = fixture.state.fields[4];
      select.options = select.options.map((option) => ({
        ...option,
        selected: option.value === '',
      }));
      receipt = await read(fixture, receipt);
      receipt = await restore(fixture, receipt);
      assert.equal(receipt.restoration.state, 'restored');
      assert.equal(receipt.restoration.applied, 5);
      assert.deepEqual(fixture.state.fields, expected);
      assert.equal(fixture.state.submitted, 0);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'changed native options and a different owner choice refuse the complete draft without writing earlier text',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await fixture.enter();
      ownerAnswers(fixture);
      choiceAnswers(fixture);
      receipt = await backup(fixture, await read(fixture, receipt));
      empty(fixture);
      const select = fixture.state.fields[4];
      select.value = 'night';
      select.options = select.options.map((option) => ({
        ...option,
        selected: option.value === 'night',
      }));
      receipt = await read(fixture, receipt);
      await assert.rejects(restore(fixture, receipt), {
        code: 'form-existing-value',
      });
      assert.equal(fixture.state.fields[1].value, '');
      assert.equal(select.value, 'night');
      select.value = '';
      select.options = select.options.map((option) => ({
        ...option,
        selected: option.value === '',
      }));
      select.options[1].label = 'Changed meaning';
      receipt = await read(
        fixture,
        await fixture.service['application-status'](applicationInput)
      );
      await assert.rejects(restore(fixture, receipt), {
        code: 'jobs-application-draft',
      });
      assert.equal(fixture.state.writes.length, 0);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'private native draft survives a new browser and explicitly restores actual owner answers without learning or sending',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    let recovered;
    try {
      const saved = await savedDraft(fixture);
      assert.deepEqual(
        saved.draft.fields.map((field) => field.value),
        ['Owner-only recent work.', 'Actual edited letter.']
      );
      assert.equal(
        saved.draft.fields.length,
        2,
        'outside header is not backed up'
      );
      assert.equal(fixture.state.writes.length, 0);
      await fixture.service.stop();
      recovered = createVacancyService(fixture.serviceOptions);
      let receipt = await recovered['application-open']({
        ...applicationInput,
        recover: true,
      });
      assert.deepEqual(
        fixture.state.fields.slice(1).map((field) => field.value),
        ['', '']
      );
      assert.equal(receipt.draft.id, saved.draft.id);
      const pending = await recovered['application-status'](applicationInput);
      assert.equal(pending.draft.id, saved.draft.id);
      assert.equal(
        fixture.state.writes.length,
        0,
        'recovery does not restore automatically'
      );
      receipt = await recovered['application-restore'](identity(receipt));
      assert.equal(receipt.restoration.state, 'restored');
      assert.equal(receipt.restoration.applied, 2);
      assert.deepEqual(
        fixture.state.fields.slice(1).map((field) => field.value),
        ['Owner-only recent work.', 'Actual edited letter.']
      );
      assert.equal(fixture.state.fields[0].value, '');
      assert.equal(
        receipt.exact,
        false,
        'restoration is not exact approved knowledge'
      );
      assert.equal(fixture.state.entered, 1);
      assert.equal(fixture.state.submitted, 0);
      assert(
        (await fixture.store.query()).every((row) =>
          row.id.startsWith('secret:jobs-application:')
        )
      );
      const again = await recovered['application-restore'](identity(receipt));
      assert.equal(again.restoration.applied, 0);
      assert.equal(
        fixture.state.writes.length,
        2,
        'same values never dispatch another write'
      );
    } finally {
      await recovered?.stop();
      await fixture.close();
    }
  }
);

test(
  'native draft operations require fresh ownership, page evidence and explicit confirmation',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await fixture.enter();
      for (const operation of ['backup', 'restore']) {
        await assert.rejects(
          fixture.service[`application-${operation}`](
            identity(receipt, { confirm: false })
          ),
          { code: 'jobs-application-confirmation' }
        );
        await assert.rejects(
          fixture.service[`application-${operation}`](
            identity(receipt, { revision: 'stale' })
          ),
          { code: 'jobs-application-changed' }
        );
      }
      ownerAnswers(fixture);
      await assert.rejects(backup(fixture, receipt), {
        code: 'jobs-application-changed',
      });
      receipt = await read(fixture, receipt);
      receipt = await backup(fixture, receipt);
      empty(fixture);
      await assert.rejects(restore(fixture, receipt), {
        code: 'jobs-application-changed',
      });
      assert.equal(fixture.state.writes.length, 0);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'restoration preserves an owner edit and refuses the entire proposed write set',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await savedDraft(fixture);
      empty(fixture);
      fixture.state.fields[2].value = 'New owner letter';
      receipt = await read(fixture, receipt);
      await assert.rejects(restore(fixture, receipt), {
        code: 'form-existing-value',
      });
      assert.equal(fixture.state.fields[1].value, '');
      assert.equal(fixture.state.fields[2].value, 'New owner letter');
      assert.equal(fixture.state.writes.length, 0);
      const status =
        await fixture.service['application-status'](applicationInput);
      assert.equal(status.restoration.state, 'refused');
      assert.equal(status.restoration.code, 'form-existing-value');
    } finally {
      await fixture.close();
    }
  }
);

test(
  'a changed question cannot receive a saved native draft',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await savedDraft(fixture);
      empty(fixture);
      fixture.state.fields[1].label = 'Different question';
      receipt = await read(fixture, receipt);
      await assert.rejects(restore(fixture, receipt), {
        code: 'jobs-application-draft',
      });
      assert.equal(fixture.state.writes.length, 0);
    } finally {
      await fixture.close();
    }
  }
);

for (const stage of ['put', 'flush']) {
  test(
    `failed ${stage} draft acknowledgement retains the earlier private backup and live owner form`,
    { timeout: 3000 },
    async () => {
      const memory = createMemoryStore();
      let failNext = false;
      const refuse = () => {
        if (failNext) {
          failNext = false;
          throw Object.assign(new Error('Draft checkpoint refused'), {
            code: 'fixture-storage',
          });
        }
      };
      const store = {
        ...memory,
        put: async (row) => {
          await memory.put(row);
          if (stage === 'put') {
            refuse();
          }
        },
        flush: async () => {
          if (stage === 'flush') {
            refuse();
          }
        },
      };
      const fixture = applicationDraftFixture({ store });
      try {
        let receipt = await savedDraft(fixture);
        const saved = receipt.draft;
        fixture.state.fields[1].value = 'New unsaved answer';
        receipt = await read(fixture, receipt);
        failNext = true;
        await assert.rejects(backup(fixture, receipt), {
          code: 'fixture-storage',
        });
        const status =
          await fixture.service['application-status'](applicationInput);
        assert.deepEqual(status.draft, saved);
        assert.deepEqual((await memory.query())[0].draft, saved);
        assert.equal(status.active, true);
        assert.equal(fixture.state.closed, 0);
        assert.equal(fixture.state.fields[1].value, 'New unsaved answer');
      } finally {
        await fixture.close();
      }
    }
  );
}

test(
  'incomplete, sensitive and unsupported native questionnaires refuse backup without replacing the saved draft',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await savedDraft(fixture);
      const saved = receipt.draft;
      const original = globalThis.structuredClone(fixture.state.fields[1]);
      for (const change of [
        { coverage: 'partial' },
        { omissions: [{ reason: 'hidden-frame' }] },
        {
          field: {
            tag: 'input',
            type: 'password',
            valueOmitted: 'password',
            value: null,
          },
        },
        {
          field: {
            tag: 'input',
            type: 'file',
            valueOmitted: 'file',
            value: null,
          },
        },
        { field: { tag: 'div', type: 'contenteditable' } },
        { field: { disabled: true } },
        { navigation: { nextPage: true, limited: false } },
      ]) {
        Object.assign(fixture.state.fields[1], original, change.field);
        fixture.hooks.report = (report) => ({
          ...report,
          ...Object.fromEntries(
            Object.entries(change).filter(([key]) => key !== 'field')
          ),
        });
        receipt = await read(fixture, receipt);
        await assert.rejects(backup(fixture, receipt), {
          code: 'jobs-application-draft',
        });
        assert.deepEqual(
          (await fixture.service['application-status'](applicationInput)).draft,
          saved
        );
      }
      assert.equal(fixture.state.writes.length, 0);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'an uncertain draft write retains the backup, records uncertainty and never proceeds to the next control or sends',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await fixture.enter(undefined, {
        autoExact: true,
        reviewDelayMs: 0,
      });
      ownerAnswers(fixture);
      receipt = await backup(fixture, await read(fixture, receipt));
      const saved = receipt.draft;
      empty(fixture);
      receipt = await read(fixture, receipt);
      fixture.hooks.write = async (field) => {
        Object.assign(
          fixture.state.fields.find((entry) => entry.id === field.id),
          field.answer.proposal
        );
        throw new Error('Lost write response');
      };
      receipt = await restore(fixture, receipt);
      assert.equal(receipt.restoration.state, 'uncertain');
      assert.equal(receipt.restoration.uncertain, 1);
      assert.deepEqual(receipt.draft, saved);
      assert.equal(fixture.state.writes.length, 1);
      assert.equal(fixture.state.fields[2].value, '');
      assert.equal(fixture.state.submitted, 0);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'paused native review and submit reservations refuse restoration effects',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await savedDraft(fixture);
      empty(fixture);
      receipt = await read(fixture, receipt);
      receipt = await fixture.service['application-mode'](
        identity(receipt, { paused: true })
      );
      await assert.rejects(restore(fixture, receipt), {
        code: 'jobs-application-state',
      });
      receipt = await fixture.service['application-mode'](
        identity(receipt, { paused: false })
      );
      const row = (await fixture.store.query())[0];
      await fixture.service.stop();
      row.attempted.submit = true;
      row.delivery = 'unknown';
      await fixture.store.put(row);
      fixture.service = createVacancyService(fixture.serviceOptions);
      receipt = await fixture.service['application-open']({
        ...applicationInput,
        recover: true,
      });
      await assert.rejects(restore(fixture, receipt), {
        code: 'jobs-application-state',
      });
      assert.equal(fixture.state.writes.length, 0);
      assert.equal(fixture.state.submitted, 0);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'native draft preview does not restore even with explicit confirmation',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await savedDraft(fixture);
      await fixture.service.stop();
      const row = (await fixture.store.query())[0];
      row.options.testMode = true;
      row.signature = JSON.stringify(row.options);
      await fixture.store.put(row);
      fixture.service = createVacancyService(fixture.serviceOptions);
      receipt = await fixture.service['application-open']({
        ...applicationInput,
        recover: true,
      });
      receipt = await restore(fixture, receipt);
      assert.equal(receipt.state, 'test-preview');
      assert.equal(fixture.state.writes.length, 0);
      assert.equal(fixture.state.submitted, 0);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'replaced native targets and late outside edits refuse restoration before writing',
  { timeout: 3000 },
  async () => {
    const fixture = applicationDraftFixture();
    try {
      let receipt = await savedDraft(fixture);
      empty(fixture);
      receipt = await read(fixture, receipt);
      fixture.hooks.targets = async () => {
        throw Object.assign(new Error('Replaced target'), {
          code: 'form-changed',
        });
      };
      await assert.rejects(restore(fixture, receipt), { code: 'form-changed' });
      assert.equal(fixture.state.writes.length, 0);
      fixture.hooks.targets = undefined;
      receipt = await read(
        fixture,
        await fixture.service['application-status'](applicationInput)
      );
      let reads = 0;
      fixture.hooks.inspect = async () => {
        if (++reads === 2) {
          fixture.state.fields[0].value = 'Late owner header';
        }
      };
      await assert.rejects(restore(fixture, receipt), { code: 'form-changed' });
      assert.equal(fixture.state.writes.length, 0);
      assert.equal(fixture.state.fields[0].value, 'Late owner header');
    } finally {
      await fixture.close();
    }
  }
);
