import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationSessionClient } from './helpers/application-session-client.mjs';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

const pollingClient = async (
  t,
  { background = true, unknown = false } = {}
) => {
  const fixture = applicationFixture();
  const client = applicationSessionClient(fixture);
  t.after(() => fixture.close());
  await client.session.select(applicationInput);
  await client.session.start({ autoSelectResumeLanguage: false });
  const held = gate();
  const entered = gate();
  const original = client.api.vacancyApplicationStatus;
  client.api.vacancyApplicationStatus = async (input) => {
    const receipt = await original(input);
    entered.resolve();
    await held.promise;
    if (client.responseError) {
      throw client.responseError;
    }
    return client.response ?? receipt;
  };
  t.after(() => held.resolve());
  if (unknown) {
    client.session.publish({ known: false });
  }
  const reading = background
    ? client.session.recover({ background: true })
    : client.session.recover();
  await entered.promise;
  return { ...client, fixture, held, client, reading };
};

test(
  'background status keeps an acknowledged action enabled while its read is pending',
  { timeout: 5000 },
  async (t) => {
    const value = await pollingClient(t);
    const receipt = value.session.state.receipt;
    const { reading } = value;
    assert.equal(value.session.state.known, true);
    assert.equal(value.session.state.receipt, receipt);
    assert.equal(value.session.state.busy, false);
    value.held.resolve();
    await reading;
    assert.equal(value.session.state.known, true);
    assert.equal(
      value.fixture.state.entered + value.fixture.state.submitted,
      0
    );
  }
);

for (const failed of [false, true]) {
  test(
    `a newer owner action supersedes a delayed background ${failed ? 'failure' : 'receipt'}`,
    { timeout: 5000 },
    async (t) => {
      const value = await pollingClient(t);
      const reading = value.reading.catch((error) => error);
      if (failed) {
        value.client.responseError = new Error('read unavailable');
      }
      const latest = await value.session.action('Advance', {
        action: 'enter',
        confirm: true,
      });
      assert.equal(latest.attempted.enter, true);
      value.held.resolve();
      await reading;
      assert.equal(value.session.state.receipt, latest);
      assert.equal(value.session.state.known, true);
      assert.equal(value.session.state.error, null);
      assert.equal(value.fixture.state.entered, 1);
      assert.equal(value.fixture.state.submitted, 0);
    }
  );
}

for (const invalid of [false, true]) {
  test(
    `background ${invalid ? 'foreign receipt' : 'read failure'} invalidates current authority`,
    { timeout: 5000 },
    async (t) => {
      const value = await pollingClient(t);
      const refused = assert.rejects(value.reading);
      if (invalid) {
        value.client.response = {
          ...value.session.state.receipt,
          url: 'https://hh.ru/vacancy/999',
        };
      } else {
        value.client.responseError = new Error('read unavailable');
      }
      value.held.resolve();
      await refused;
      assert.equal(value.session.state.known, false);
      await assert.rejects(
        value.session.action('Advance', { action: 'enter', confirm: true })
      );
      assert.equal(
        value.fixture.state.entered + value.fixture.state.submitted,
        0
      );
    }
  );
}

for (const unknown of [false, true]) {
  test(
    unknown
      ? 'a background lookup cannot promote an unknown action before its response'
      : 'manual recovery blocks action admission until its fresh receipt arrives',
    { timeout: 5000 },
    async (t) => {
      const value = await pollingClient(t, { background: unknown, unknown });
      assert.equal(value.session.state.known, false);
      await assert.rejects(value.session.action('Read'));
      value.held.resolve();
      await value.reading;
      assert.equal(value.session.state.known, true);
    }
  );
}
