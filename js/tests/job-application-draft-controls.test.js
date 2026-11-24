import { runApplicationFixtureCommand } from './helpers/application-controls.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationDraftFixture } from '../../experiments/issue-56/application-draft-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createApplicationApi } from '../src/web/application-api.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationDraftView } from '../src/web/application-draft-view.js';
import { translate } from '../src/web/i18n.js';

test('all four locales review actual private draft values as escaped text with truthful restoration states', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const t = (key, values) => translate(locale, key, values);
    for (const name of [
      'backup',
      'restore',
      'draft',
      'draftSaved',
      'draftHint',
      'draft.checked',
      'draft.unchecked',
      'restore.restoring',
      'restore.restored',
      'restore.refused',
      'restore.partial',
      'restore.uncertain',
    ]) {
      assert.notEqual(t(`application.${name}`), `application.${name}`);
      if (locale !== 'en') {
        assert.notEqual(
          t(`application.${name}`),
          translate('en', `application.${name}`)
        );
      }
    }
    for (const state of [
      'restoring',
      'restored',
      'refused',
      'partial',
      'uncertain',
    ]) {
      const markup = renderToStaticMarkup(
        React.createElement(ApplicationDraftView, {
          t,
          receipt: {
            draft: {
              capturedAt: '2026-11-14T00:00:00Z',
              fields: [
                {
                  label: 'Actual question',
                  value: '<script>private</script>',
                  checked: null,
                },
                { label: 'Native choice', value: 'yes', checked: true },
              ],
            },
            restoration: { state },
          },
        })
      );
      assert(markup.includes('&lt;script&gt;private&lt;/script&gt;'));
      assert(!markup.includes('<script>'));
      assert(markup.includes(`data-application-restoration="${state}"`));
      assert(!markup.includes('<details open'));
      assert(!markup.includes('application.restore.'));
    }
  }
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `native draft HTTP backup and restoration preserve actual answers over ${type}`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationDraftFixture();
      t.after(() => fixture.close());
      await withRoutes(
        async (base) => {
          let receipt;
          const post = async (operation, extra = {}) => {
            const response = await wirePost(
              base,
              `application-${operation}`,
              {
                ...applicationInput,
                revision: receipt?.revision,
                ...extra,
              },
              type
            );
            assert.equal(response.status, 200, JSON.stringify(response.value));
            receipt = response.value;
          };
          await post('open');
          await post('advance', { action: 'enter', confirm: true });
          fixture.state.fields[1].value = 'Actual owner answer';
          await post('read');
          for (const name of ['backup', 'restore']) {
            const rejected = await wirePost(
              base,
              `application-${name}`,
              {
                ...applicationInput,
                revision: receipt.revision,
                confirm: true,
              },
              type,
              { origin: 'https://foreign.test' }
            );
            assert.equal(rejected.status, 403);
          }
          await post('backup', { confirm: true });
          assert.equal(receipt.draft.fields[0].value, 'Actual owner answer');
          fixture.state.fields[1].value = '';
          await post('read');
          await post('restore', { confirm: true });
          assert.equal(receipt.restoration.state, 'restored');
          assert.equal(fixture.state.fields[1].value, 'Actual owner answer');
          assert.equal(fixture.state.writes.length, 1);
          assert.equal(fixture.state.submitted, 0);
          await post('close');
        },
        { store: fixture.store, service: fixture.serviceOptions }
      );
    }
  );
}

test(
  'browser draft API binds and validates both new receipts without retrying',
  { timeout: 3000 },
  async (t) => {
    const fixture = applicationDraftFixture();
    t.after(() => fixture.close());
    let receipt = await fixture.enter();
    receipt = await fixture.service['application-backup']({
      ...applicationInput,
      revision: receipt.revision,
      confirm: true,
    });
    const calls = [];
    let raw = receipt;
    const api = createApplicationApi({
      report: async (...args) => {
        calls.push(args);
        return raw;
      },
    });
    for (const name of ['Backup', 'Restore']) {
      assert.deepEqual(
        (await api[`vacancyApplication${name}`](applicationInput)).draft,
        receipt.draft
      );
      assert.deepEqual(calls.at(-1)[2], { network: true, read: false });
    }
    for (const draft of [
      { ...receipt.draft, version: 99 },
      { ...receipt.draft, fields: [] },
      {
        ...receipt.draft,
        fields: [{ ...receipt.draft.fields[0], type: 'password' }],
      },
    ]) {
      raw = { ...receipt, draft };
      await assert.rejects(api.vacancyApplicationBackup(applicationInput), {
        code: 'jobs-application-unconfirmed',
      });
    }
    raw = {
      ...receipt,
      restoration: {
        state: 'restored',
        applied: 26,
        unchanged: 0,
        uncertain: 0,
        code: null,
      },
    };
    await assert.rejects(api.vacancyApplicationRestore(applicationInput), {
      code: 'jobs-application-unconfirmed',
    });
    assert.equal(calls.length, 6);
  }
);

test(
  'foreground CLI exposes explicitly reviewed native draft backup and restoration',
  { timeout: 3000 },
  async (t) => {
    const fixture = applicationDraftFixture();
    const actions = async function* () {
      yield 'enter';
      fixture.state.fields[1].value = 'CLI owner answer';
      yield 'read';
      yield 'backup';
      fixture.state.fields[1].value = '';
      yield 'read';
      yield 'restore';
      yield 'quit';
    };
    t.after(() => fixture.close());
    const { status, output } = await runApplicationFixtureCommand(
      fixture,
      actions
    );
    assert.equal(status, 0);
    assert(output[1].commands.includes('backup'));
    assert(output[1].commands.includes('restore'));
    assert.equal(output.at(-1).restoration.state, 'restored');
    assert.equal(fixture.state.fields[1].value, 'CLI owner answer');
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, 1);
  }
);
