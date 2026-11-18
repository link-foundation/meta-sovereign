import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  applicationInput,
  applicationFixture,
} from '../../experiments/issue-56/application-fixture.mjs';
import { confirmationApplication } from '../../experiments/issue-56/application-confirmation-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import {
  assertApplicationPanelLocales,
  withApplicationRouteFixture,
  successfulApplicationFixtureCommand,
  runApplicationFixtureCommand,
} from './helpers/application-controls.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `independent confirmations use guarded production routes in ${type}`,
    { timeout: 10000 },
    async (t) => {
      const f = applicationFixture();
      t.after(() => f.close());
      await withApplicationRouteFixture(f, type, async (api) => {
        let receipt = await api.vacancyApplicationOpen({
          ...applicationInput,
          confirmations: ['answers', 'send'],
        });
        receipt = await api.vacancyApplicationAdvance(
          identity(receipt, { action: 'enter', confirm: true })
        );
        receipt = await api.vacancyApplicationContinue(identity(receipt));
        assert.equal(receipt.continuation.step, 'answers');
        assert.equal(f.state.writes.length, 0);
        receipt = await api.vacancyApplicationContinue(
          identity(receipt, { step: 'answers', confirm: true })
        );
        assert.equal(receipt.continuation.step, 'send');
        assert.equal(f.state.submitted, 0);
        receipt = await api.vacancyApplicationContinue(
          identity(receipt, { step: 'send', confirm: true })
        );
        assert.equal(receipt.delivery, 'provider-confirmed');
        assert.equal(f.state.submitted, 1);
      });
    }
  );
}

test(
  'foreground confirmation switches and distinct commands preserve per-step consent',
  { timeout: 10000 },
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    const output = await successfulApplicationFixtureCommand(
      f,
      () =>
        Readable.from([
          'enter',
          'continue',
          'confirm-send',
          'confirm-answers',
          'confirm-send',
          'quit',
        ]),
      { confirm: 'answers,send' }
    );
    assert(output.some((row) => row.continuation?.step === 'answers'));
    assert(output.some((row) => row.continuation?.step === 'send'));
    assert(output.some((row) => row.code === 'jobs-application-confirmation'));
    assert(output.some((row) => row.delivery === 'provider-confirmed'));
    assert.equal(f.state.submitted, 1);
  }
);

test(
  'CLI none permits only explicitly invoked continuation, not startup or status',
  { timeout: 10000 },
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    const output = await successfulApplicationFixtureCommand(
      f,
      () => Readable.from(['enter', 'status', 'continue', 'quit']),
      { confirm: 'none' }
    );
    assert.equal(
      output.filter((row) => row.delivery === 'provider-confirmed').length,
      1
    );
    assert.equal(f.state.submitted, 1);
    assert.equal(f.state.fields[0].value, '');
  }
);

test(
  'invalid CLI confirmation names refuse before browser ownership',
  { timeout: 10000 },
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    await assert.rejects(
      runApplicationFixtureCommand(f, () => Readable.from([]), {
        confirm: 'answers,typo',
      })
    );
    assert.equal(f.state.opened, 0);
  }
);

test(
  'four-language settings and saved pending-step controls do not imply delivery',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, {
      confirmations: ['answers', 'send'],
    });
    const receipt = await f.progress();
    assertApplicationPanelLocales(
      receipt,
      ['confirmationSettings', 'continue', 'continuation.answers'],
      (markup) => {
        assert(markup.includes('data-application-confirmation="cover-letter"'));
        assert(markup.includes('data-application-continuation="answers"'));
        assert.match(
          markup,
          /data-application-action="confirm-step"[^>]*disabled/
        );
        assert(markup.includes('data-application-delivery="none"'));
      }
    );
  }
);
