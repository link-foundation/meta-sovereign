import test from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationSession } from '../src/web/application-session.js';
import { applicationResult } from '../src/jobs/application-result.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

const storage = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
const client = (fixture, saved = storage()) => {
  const calls = [];
  const api = Object.fromEntries(
    ['status', 'open', 'read', 'advance', 'prefill', 'mode', 'close'].map(
      (operation) => [
        `vacancyApplication${operation[0].toUpperCase()}${operation.slice(1)}`,
        async (input) => {
          calls.push([operation, input]);
          return fixture.service[`application-${operation}`](input);
        },
      ]
    )
  );
  api.vacancyCancel = () => fixture.service.cancel();
  return { api, calls, saved, session: new ApplicationSession(api, saved) };
};

test(
  'browser recovery never replays a lost application response or persists the letter',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const value = client(fixture);
    try {
      await value.session.select(applicationInput);
      assert.equal(value.session.state.missing, true);
      assert.deepEqual(
        value.calls.map(([name]) => name),
        ['status']
      );
      await value.session.start({
        coverLetter: 'Private owner letter',
        url: 'https://hh.ru/vacancy/999',
        browserSlot: 'foreign',
        reviewDelayMs: 0,
      });
      assert.equal(value.session.state.receipt.active, true);
      const original = value.api.vacancyApplicationAdvance;
      value.api.vacancyApplicationAdvance = async (input) => {
        await original(input);
        throw new Error('lost response');
      };
      await assert.rejects(
        value.session.action('Advance', { action: 'enter', confirm: true })
      );
      assert.equal(value.session.state.known, false);
      assert.equal(fixture.state.entered, 1);
      await assert.rejects(
        value.session.action('Advance', { action: 'enter', confirm: true })
      );
      const reopened = client(fixture, value.saved);
      await reopened.session.recover();
      assert.deepEqual(
        reopened.calls.map(([name]) => name),
        ['status']
      );
      assert.equal(reopened.session.state.receipt.attempted.enter, true);
      // A fresh native questionnaire confirms entry did not deliver an application.
      assert.equal(reopened.session.state.receipt.delivery, 'none');
      const pending = JSON.parse([...value.saved.values.values()][0]);
      assert.deepEqual(Object.keys(pending).sort(), [
        'browserSlot',
        'requestId',
        'url',
      ]);
      assert.equal(pending.url, applicationInput.url);
      assert.equal(pending.browserSlot, 'jobs');
      assert(!JSON.stringify(pending).includes('Private owner letter'));
      assert.equal(fixture.state.entered, 1);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'switching or clearing selection invalidates stale reads and preserves an owned review',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const value = client(fixture);
    try {
      const held = gate();
      const original = value.api.vacancyApplicationStatus;
      value.api.vacancyApplicationStatus = async (input) => {
        await held.promise;
        return original(input);
      };
      const loading = value.session.select(applicationInput);
      await value.session.select(null);
      held.resolve();
      await loading;
      assert.equal(value.session.state.known, false);
      assert.equal(value.session.state.receipt, null);
      value.api.vacancyApplicationStatus = original;
      await value.session.select(applicationInput);
      await value.session.start({});
      const intent = { ...value.session.state.intent };
      await value.session.select({
        url: 'https://hh.ru/vacancy/456',
        browserSlot: 'jobs-2',
      });
      await value.session.action('Read', {
        url: 'https://hh.ru/vacancy/789',
        browserSlot: 'foreign',
        requestId: 'foreign',
        revision: 'foreign',
      });
      assert.deepEqual(value.calls.at(-1)[1], {
        ...intent,
        revision: value.calls.at(-1)[1].revision,
      });
      assert.equal(value.session.state.receipt.url, applicationInput.url);
      assert.throws(() => value.session.reopen());
      await value.session.action('Close');
      assert.equal(value.session.state.receipt.active, false);
      assert.equal(value.session.state.intent, null);
      assert.equal(value.saved.values.size, 0);
      await value.session.release();
      assert.equal(value.session.state.missing, true);
      assert.equal(value.session.state.target.browserSlot, 'jobs-2');
    } finally {
      await fixture.close();
    }
  }
);

test(
  'unrelated, malformed and unavailable status remain unknown',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const value = client(fixture);
    try {
      const receipt =
        await fixture.service['application-open'](applicationInput);
      for (const response of [
        null,
        { ...receipt, url: 'https://hh.ru/vacancy/456' },
        { ...receipt, active: undefined },
        { ok: false, mode: 'hh-application-missing', ...applicationInput },
      ]) {
        value.api.vacancyApplicationStatus = async () => response;
        await assert.rejects(value.session.select(applicationInput));
        assert.equal(value.session.state.known, false);
        assert.equal(value.session.state.intent, null);
        assert.throws(() => value.session.start({}));
      }
      assert.equal(value.calls.length, 0);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'storage admission and synchronous request failures cannot unlock a second action',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const value = client(fixture);
    try {
      await value.session.select(applicationInput);
      value.saved.setItem = () => {
        throw new Error('quota');
      };
      assert.throws(() => value.session.start({}));
      assert.equal(value.calls.length, 1);
      value.saved.setItem = (key, entry) => value.saved.values.set(key, entry);
      value.api.vacancyApplicationOpen = () => {
        throw new Error('synchronous refusal');
      };
      await assert.rejects(value.session.start({}));
      assert.equal(value.session.state.busy, false);
      assert.equal(value.session.state.known, false);
      assert(value.session.state.intent);
      assert.throws(() => value.session.start({}));
      const blocked = new ApplicationSession(value.api, {
        getItem() {
          throw new Error('disabled');
        },
      });
      await assert.rejects(blocked.select(applicationInput));
      assert.equal(blocked.state.known, false);
      assert.equal(value.calls.length, 1);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'stop waits for an outstanding response before a read-only recovery',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const value = client(fixture);
    try {
      await value.session.select(applicationInput);
      const held = gate();
      const cancelled = gate();
      const originalOpen = value.api.vacancyApplicationOpen;
      value.api.vacancyApplicationOpen = async () => {
        await held.promise;
        throw new Error('cancelled');
      };
      value.api.vacancyCancel = async () => {
        cancelled.resolve();
        return { stopped: true };
      };
      const opening = value.session.start({}).catch(() => {});
      const stopping = value.session.stop();
      assert.equal(value.session.stop(), stopping);
      await cancelled.promise;
      assert.equal(value.session.state.busy, true);
      assert.equal(value.calls.length, 1);
      held.resolve();
      await Promise.all([opening, stopping]);
      assert.equal(value.session.state.busy, false);
      assert.equal(value.session.state.missing, true);
      assert.deepEqual(
        value.calls.map(([name]) => name),
        ['status', 'status']
      );
      assert.equal(fixture.state.opened, 0);
      // A read-confirmed missing request still retains its original local identity.
      assert.throws(() => value.session.start({}));
      await value.session.release();
      assert.equal(value.session.state.intent, null);
      value.api.vacancyApplicationOpen = originalOpen;
      await value.session.start({ testMode: true });
      assert.equal(fixture.state.opened, 1);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'durable application receipts cannot claim a live browser after restart',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    try {
      const receipt =
        await fixture.service['application-open'](applicationInput);
      assert.equal(applicationResult(receipt, applicationInput).active, true);
      await fixture.service.cancel();
      const rows = await fixture.store.query((row) =>
        row.id.startsWith('secret:jobs-application:')
      );
      await fixture.store.put({ ...rows[0], active: true });
      const status =
        await fixture.service['application-status'](applicationInput);
      assert.equal(status.state, 'interrupted');
      assert.equal(status.active, false);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'a confirmed unissued preview can start a fresh reviewed intent without treating history as absent',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const value = client(fixture);
    try {
      await value.session.select(applicationInput);
      await value.session.start({ testMode: true });
      const first = value.session.state.intent.requestId;
      await value.session.action('Advance', { action: 'enter', confirm: true });
      assert.equal(value.session.state.receipt.state, 'test-preview');
      assert.equal(fixture.state.entered, 0);
      await value.session.action('Close');
      await value.session.recover();
      assert.equal(value.session.state.missing, false);
      assert.equal(value.session.state.receipt.active, false);
      await value.session.release();
      assert.equal(value.session.state.intent, null);
      assert.equal(value.session.state.missing, false);
      await value.session.start({
        testMode: false,
        coverLetter: 'New reviewed letter',
      });
      assert.notEqual(value.session.state.intent.requestId, first);
      assert.equal(value.session.state.receipt.testMode, false);
      await value.session.action('Advance', { action: 'enter', confirm: true });
      assert.equal(fixture.state.entered, 1);
      await value.session.action('Close');
      assert.throws(() => value.session.start({}));
    } finally {
      await fixture.close();
    }
  }
);
