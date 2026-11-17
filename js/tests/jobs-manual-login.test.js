import test from 'node:test';
import assert from 'node:assert/strict';
import { createVacancyService } from '../src/jobs/service.js';
import { saveBrowserPolicy } from '../src/browser/policy.js';
import { loginKey, loginResult } from '../src/jobs/login-record.js';
import {
  jobLoginFixture,
  jobLoginInput,
} from '../../experiments/issue-56/job-login-fixture.mjs';

const fixture = (t) => {
  const f = jobLoginFixture();
  t.after(() => f.service.stop());
  return f;
};
const input = jobLoginInput();
const deferred = () => Promise.withResolvers();

test(
  'manual HH login opens only the fixed visible page in the shared workspace slot',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    const { login } = await f.service['login-open'](input);
    assert.equal(login.state, 'browser-open');
    assert.equal(login.active, true);
    assert.equal(login.manual, true);
    assert.equal(login.authentication, 'unverified');
    assert.equal(
      Date.parse(login.expiresAt) - Date.parse(login.startedAt),
      1800000
    );
    assert.equal(f.calls.launches.length, 1);
    assert.deepEqual(f.calls.navigations, [
      {
        url: 'https://hh.ru/account/login',
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      },
    ]);
    const opened = f.calls.launches[0];
    assert.equal(opened.headless, false);
    assert.equal(opened.platform, 'hh');
    assert.equal(opened.useCase, 'jobs');
    assert.equal(opened.slot, input.browserSlot);
    assert.match(
      opened.profileDir,
      /browser-profiles[/\\]hh[/\\]slots[/\\]account-two$/u
    );
    assert.equal(f.page.listenerCount('close'), 1);
  }
);

test(
  'manual login reserves all job readers and application review across service instances',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    await f.service['login-open'](input);
    const other = createVacancyService(f.options);
    t.after(() => other.stop());
    for (const service of [f.service, other]) {
      for (const operation of ['resumes', 'search', 'application-open']) {
        await assert.rejects(
          service[operation]({
            requestId: 'other',
            url: 'https://hh.ru/vacancy/123',
            browserSlot: 'another',
          }),
          { code: 'jobs-busy' }
        );
      }
    }
    assert.equal(f.calls.launches.length, 1);
    assert.equal((await other['login-status'](input)).login.active, true);
  }
);

test(
  'repeated manual login IDs recover receipts and never reopen after close',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    const first = await f.service['login-open'](input);
    assert.deepEqual(await f.service['login-open'](input), first);
    await assert.rejects(
      f.service['login-open']({ ...input, durationMs: 1000 }),
      { code: 'jobs-login-conflict' }
    );
    await assert.rejects(
      f.service['login-status']({ ...input, browserSlot: 'another' }),
      { code: 'jobs-login-state' }
    );
    assert.equal((await f.service['login-close'](input)).login.state, 'closed');
    assert.equal((await f.service['login-open'](input)).login.state, 'closed');
    assert.equal(f.calls.launches.length, 1);
    assert.equal(f.calls.closes, 1);
    assert.equal(f.timers.size, 0);
    assert.equal(f.page.listenerCount('close'), 0);
  }
);

test(
  'manual login respects saved headless policy and accepts an explicit visible override',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    await saveBrowserPolicy(f.store, {
      scope: 'slot',
      key: 'hh/account-two',
      headless: true,
    });
    await assert.rejects(f.service['login-open'](input), {
      code: 'jobs-login-visible',
    });
    assert.equal(f.calls.launches.length, 0);
    assert.equal(await f.store.get(loginKey(input.requestId)), null);
    await f.service['login-open']({ ...input, headless: false });
    assert.equal(f.calls.launches[0].headless, false);
  }
);

test(
  'manual login rejects unbounded or invalid inputs before browser launch',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    for (const change of [
      { durationMs: 0 },
      { durationMs: 1800001 },
      { durationMs: Infinity },
      { durationMs: '1000' },
      { requestId: '../secret' },
      { browserSlot: '../secret' },
      { headless: 'false' },
    ]) {
      await assert.rejects(f.service['login-open']({ ...input, ...change }));
    }
    assert.equal(f.calls.launches.length, 0);
  }
);

test(
  'manual login deadline closes the actual named slot and never claims authentication',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    await f.service['login-open']({ ...input, durationMs: 1000 });
    const timer = [...f.timers.values()][0];
    assert.equal(timer.duration, 1000);
    f.advance(1000);
    timer.callback();
    const { login } = await f.wait('expired');
    assert.equal(login.active, false);
    assert.equal(login.authentication, 'unverified');
    assert.equal(f.calls.closes, 1);
    assert.equal(f.timers.size, 0);
  }
);

test(
  'manually closing the native login page drains its browser and releases ownership',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    await f.service['login-open'](input);
    f.page.emit('close');
    await f.wait('closed');
    assert.equal(f.calls.closes, 1);
    assert.equal(f.page.listenerCount('close'), 0);
    await f.service['login-open']({ ...input, requestId: 'new-window' });
    assert.equal(f.calls.launches.length, 2);
  }
);

test(
  'failed manual browser closure retains its owner until explicit successful close',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    await f.service['login-open'](input);
    f.beforeClose(() => {
      throw new Error('private cookie password URL');
    });
    await assert.rejects(f.service['login-close'](input), {
      code: 'jobs-login-close',
    });
    const status = await f.service['login-status'](input);
    assert.equal(status.login.state, 'close-failed');
    assert.equal(status.login.active, true);
    assert.doesNotMatch(JSON.stringify(status), /cookie|password|URL/u);
    await assert.rejects(f.service.resumes({}), { code: 'jobs-busy' });
    f.beforeClose(null);
    assert.equal((await f.service['login-close'](input)).login.active, false);
    assert.equal(f.calls.closes, 2);
  }
);

test(
  'failed manual login navigation closes its issued session and permits a new request',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    f.beforeNavigation(() => {
      throw new Error('synthetic native refusal');
    });
    await assert.rejects(
      f.service['login-open'](input),
      /synthetic native refusal/u
    );
    assert.equal(
      (await f.service['login-status'](input)).login.state,
      'failed'
    );
    assert.equal(f.calls.closes, 1);
    f.beforeNavigation(null);
    await f.service['login-open']({ ...input, requestId: 'second' });
    assert.equal(f.calls.launches.length, 2);
  }
);

test(
  'Stop during a manual login launch waits for and closes the issued session',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    const entered = deferred(),
      release = deferred();
    f.beforeLaunch(async () => {
      entered.resolve();
      await release.promise;
    });
    const opening = f.service['login-open'](input);
    const result = Promise.allSettled([opening]);
    await entered.promise;
    let finished = false;
    const stop = f.service.cancel().then(() => {
      finished = true;
    });
    await Promise.resolve();
    assert.equal(finished, false);
    await assert.rejects(f.service.resumes({}), { code: 'jobs-busy' });
    release.resolve();
    await stop;
    assert.equal((await result)[0].status, 'rejected');
    assert.equal(f.calls.closes, 1);
    assert.equal(f.calls.navigations.length, 0);
    assert.equal(
      (await f.service['login-status'](input)).login.state,
      'cancelled'
    );
  }
);

test(
  'shutdown waits for manual browser closure and refuses later login admission',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    await f.service['login-open'](input);
    const entered = deferred(),
      release = deferred();
    f.beforeClose(async () => {
      entered.resolve();
      await release.promise;
    });
    let finished = false;
    const stopping = f.service.stop().then(() => {
      finished = true;
    });
    await entered.promise;
    assert.equal(finished, false);
    await assert.rejects(
      f.service['login-open']({ ...input, requestId: 'late' }),
      { code: 'jobs-stopped' }
    );
    release.resolve();
    await stopping;
    assert.equal(
      (await f.service['login-status'](input)).login.state,
      'cancelled'
    );
  }
);

test(
  'saved interrupted login receipts and readonly status never launch a replacement',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    await f.service['login-open'](input);
    const saved = globalThis.structuredClone(
      await f.store.get(loginKey(input.requestId))
    );
    await f.service['login-close'](input);
    await f.store.put(saved);
    const status = await f.service['login-status'](input);
    assert.equal(status.login.state, 'interrupted');
    assert.equal(status.login.active, false);
    assert.deepEqual(await f.service['login-open'](input), status);
    assert.equal(f.calls.launches.length, 1);
    assert.equal((await f.store.get(saved.id)).state, 'browser-open');
  }
);

test(
  'unacknowledged close receipts keep ownership without closing the browser twice',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    await f.service['login-open'](input);
    let fail = true;
    f.store.flush = async () => {
      if (fail) {
        throw new Error('disk unavailable');
      }
    };
    await assert.rejects(f.service['login-close'](input));
    await assert.rejects(f.service.resumes({}), { code: 'jobs-busy' });
    assert.equal(f.calls.closes, 1);
    fail = false;
    await f.service['login-close'](input);
    assert.equal(f.calls.closes, 1);
    assert.equal(
      (await f.service['login-status'](input)).login.state,
      'closed'
    );
  }
);

test(
  'Stop from another workspace service drains the actual manual login owner',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    await f.service['login-open'](input);
    const other = createVacancyService(f.options);
    t.after(() => other.stop());
    const entered = deferred(),
      release = deferred();
    f.beforeClose(async () => {
      entered.resolve();
      await release.promise;
    });
    let finished = false;
    const stopping = other.cancel().then(() => {
      finished = true;
    });
    // Allow the current implementation to expose an incorrect early Stop receipt.
    await new Promise((resolve) => globalThis.setImmediate(resolve));
    if (finished) {
      release.resolve();
      assert.fail('Stop acknowledged before the held login owner was drained.');
    }
    await entered.promise;
    release.resolve();
    await stopping;
    assert.equal(f.calls.closes, 1);
    assert.equal(
      (await f.service['login-status'](input)).login.state,
      'cancelled'
    );
  }
);

test(
  'failed admission writes release ownership when no browser was issued',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    f.store.flush = async () => {
      throw new Error('synthetic admission failure');
    };
    await assert.rejects(f.service['login-open'](input));
    assert.equal(f.calls.launches.length, 0);
    f.store.flush = async () => {};
    await f.service['login-open']({ ...input, requestId: 'after-admission' });
    assert.equal(f.calls.launches.length, 1);
  }
);

test(
  'manual login receipts reject forged authentication and inconsistent activity states',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    const { login } = await f.service['login-open'](input);
    for (const change of [
      { authentication: 'verified' },
      { active: false },
      { state: 'closed' },
      { version: 2 },
      { expiresAt: login.startedAt },
    ]) {
      assert.throws(() => loginResult({ ...login, ...change }), {
        code: 'jobs-login-state',
      });
    }
  }
);
