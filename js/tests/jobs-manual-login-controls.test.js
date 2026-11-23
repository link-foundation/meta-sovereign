import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  createVacancyCommands,
  VACANCY_HELP,
} from '../src/cli/vacancy-commands.js';
import { createJobLoginApi } from '../src/web/job-login-api.js';
import { JobLoginPanel } from '../src/web/job-login-panel.js';
import { translate } from '../src/web/i18n.js';
import { renderInLocale } from './util-render.js';
import {
  decodeWire,
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import {
  jobLoginFixture,
  jobLoginInput,
} from '../../experiments/issue-56/job-login-fixture.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `manual login Lino routes protect open/close and status never launches in ${type}`,
    { timeout: 5000 },
    async (t) => {
      const f = jobLoginFixture();
      t.after(() => f.service.stop());
      const input = jobLoginInput();
      await withRoutes(
        async (base) => {
          const foreign = { origin: 'https://untrusted.test' };
          assert.equal(
            (await wirePost(base, 'login-open', input, type, foreign)).status,
            403
          );
          assert.equal(
            (await fetch(`${base}/api/vacancies/login-open`)).status,
            405
          );
          const opened = await wirePost(base, 'login-open', input, type);
          assert.equal(opened.status, 200);
          assert.equal(opened.value.login.state, 'browser-open');
          assert.equal(opened.value.login.authentication, 'unverified');
          const api = createJobLoginApi({
            get: async (path) => {
              const response = await fetch(`${base}${path}`, {
                headers: { accept: type },
              });
              return decodeWire(
                await response.arrayBuffer(),
                response.headers.get('content-type')
              );
            },
            report: async (path, value) =>
              (await wirePost(base, path.split('/').at(-1), value, type)).value,
          });
          assert.equal(
            (await api.vacancyLoginStatus(input)).login.active,
            true
          );
          assert.equal(f.calls.launches.length, 1);
          assert.equal(
            (await wirePost(base, 'login-close', input, type, foreign)).status,
            403
          );
          assert.equal(
            (await wirePost(base, 'login-status', input, type)).status,
            405
          );
          assert.equal(
            (await api.vacancyLoginClose(input)).login.state,
            'closed'
          );
          assert.equal(
            (await api.vacancyLoginOpen(input)).login.state,
            'closed'
          );
          assert.equal(f.calls.launches.length, 1);
          assert.equal(f.calls.closes, 1);
        },
        { store: f.store, service: f.options }
      );
    }
  );
  test(
    `manual login attention uses no-store and guarded exact focus in ${type}`,
    { timeout: 5000 },
    async (t) => {
      const f = jobLoginFixture();
      t.after(() => f.service.stop());
      const input = jobLoginInput();
      await withRoutes(
        async (base) => {
          const api = createJobLoginApi({
            get: async (path, options) => {
              assert.equal(options.recover, false);
              const response = await fetch(`${base}${path}`, {
                headers: { accept: type },
                signal: options.signal,
              });
              assert.equal(
                response.status,
                200,
                'read-only HeadHunter login route'
              );
              assert.equal(response.headers.get('cache-control'), 'no-store');
              return readWireResponse(response);
            },
            report: async (path, value, options) => {
              assert.deepEqual(options, { network: true, read: false });
              return (await wirePost(base, path.split('/').at(-1), value, type))
                .value;
            },
          });
          await wirePost(base, 'login-open', input, type);
          const {
            attention: [notice],
          } = await api.vacancyLoginAttention();
          assert.equal(notice.requestId, input.requestId);
          assert.equal(notice.browserSlot, input.browserSlot);
          assert.equal(
            (await fetch(`${base}/api/vacancies/login-attention-focus`)).status,
            405
          );
          assert.equal(
            (
              await wirePost(base, 'login-attention-focus', notice, type, {
                origin: 'https://untrusted.test',
              })
            ).status,
            403
          );
          assert.equal(
            (
              await wirePost(
                base,
                'login-attention-focus',
                { ...notice, browserSlot: 'other' },
                type
              )
            ).value.code,
            'jobs-attention-ended'
          );
          assert.deepEqual(await api.vacancyLoginAttentionFocus(notice), {
            ok: true,
          });
          await wirePost(base, 'login-close', input, type);
          assert.deepEqual((await api.vacancyLoginAttention()).attention, []);
          assert.equal(
            (await api.vacancyLoginAttentionFocus(notice)).code,
            'jobs-attention-ended'
          );
          assert.equal(f.calls.launches.length, 1);
          assert.equal(f.calls.focuses, 1);
        },
        { store: f.store, service: f.options }
      );
    }
  );
}

test(
  'manual login web API rejects unavailable status and mismatched or forged receipts',
  { timeout: 5000 },
  async (t) => {
    const f = jobLoginFixture();
    t.after(() => f.service.stop());
    const input = jobLoginInput();
    const original = await f.service['login-open'](input);
    let answer;
    const calls = [];
    const api = createJobLoginApi({
      get: async (path) => {
        calls.push(['GET', path]);
        return answer;
      },
      report: async (...args) => {
        calls.push(['POST', ...args]);
        return answer;
      },
    });
    await assert.rejects(api.vacancyLoginStatus(input), {
      code: 'jobs-login-unavailable',
    });
    for (const change of [
      { authentication: 'verified' },
      { browserSlot: 'another' },
      { requestId: 'different' },
      { active: false },
    ]) {
      answer = { login: { ...original.login, ...change } };
      await assert.rejects(api.vacancyLoginOpen(input), {
        code: 'jobs-login-state',
      });
    }
    answer = original;
    assert.deepEqual(await api.vacancyLoginOpen(input), original);
    assert.deepEqual(calls.at(-1).at(-1), { network: true, read: false });
    const before = calls.length;
    await assert.rejects(
      api.vacancyLoginOpen({ ...input, durationMs: Infinity })
    );
    await assert.rejects(api.vacancyLoginClose({ browserSlot: '../invalid' }));
    assert.equal(calls.length, before);
  }
);
test(
  'manual login web API preserves the visible-browser refusal for actionable recovery',
  { timeout: 5000 },
  async () => {
    const api = createJobLoginApi({
      report: async () => ({ code: 'jobs-login-visible' }),
    });
    await assert.rejects(api.vacancyLoginOpen(jobLoginInput()), {
      code: 'jobs-login-visible',
    });
  }
);

test(
  'foreground manual login CLI drains on Ctrl+C and status never reopens it',
  { timeout: 5000 },
  async (t) => {
    const f = jobLoginFixture();
    t.after(() => f.service.stop());
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      ...f.options,
    });
    const output = [];
    const signals = process.listenerCount('SIGINT');
    const args = {
      'request-id': 'cli-manual',
      'browser-slot': 'account-two',
      headless: 'false',
    };
    assert.equal(
      await commands['vacancies-login-open'](args, (text) => {
        const receipt = decodeWire(text);
        output.push(receipt);
        if (receipt.login.state === 'browser-open') {
          process.emit('SIGINT');
        }
      }),
      0
    );
    assert.deepEqual(
      output.map((row) => row.login.state),
      ['browser-open', 'cancelled']
    );
    assert.equal(output.at(-1).login.authentication, 'unverified');
    await commands['vacancies-login-status'](args, (text) =>
      output.push(decodeWire(text))
    );
    assert.equal(output.at(-1).login.state, 'cancelled');
    assert.equal(f.calls.launches.length, 1);
    assert.equal(f.calls.closes, 1);
    assert.equal(process.listenerCount('SIGINT'), signals);
    assert.match(VACANCY_HELP, /vacancies-login-open/u);
  }
);

test(
  'foreground manual login CLI Stop during launch drains before store closure',
  { timeout: 5000 },
  async (t) => {
    const f = jobLoginFixture();
    t.after(() => f.service.stop());
    const entered = Promise.withResolvers(),
      release = Promise.withResolvers();
    f.beforeLaunch(async () => {
      entered.resolve();
      await release.promise;
    });
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      ...f.options,
    });
    const result = Promise.allSettled([
      commands['vacancies-login-open'](
        { 'request-id': 'cli-launch', 'browser-slot': 'account-two' },
        () => {}
      ),
    ]);
    await entered.promise;
    process.emit('SIGINT');
    release.resolve();
    assert.equal((await result)[0].status, 'rejected');
    assert.equal(f.calls.closes, 1);
    assert.equal(f.calls.navigations.length, 0);
  }
);

test(
  'foreground manual login CLI shows and focuses its own wait and drains on quit',
  { timeout: 5000 },
  async (t) => {
    const f = jobLoginFixture();
    t.after(() => f.service.stop());
    const output = [];
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield 'status';
        yield 'attention';
        yield 'focus stale';
        const current = output.find((row) => row.attention)?.attention[0];
        yield `focus ${current?.id}`;
        yield 'quit';
        assert.fail('quit must drain the owned browser and stop reading');
      },
    };
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      readLoginInput: () => stream,
      ...f.options,
    });
    const watchdog = setTimeout(() => process.emit('SIGINT'), 2000);
    const exit = await commands['vacancies-login-open'](
      { 'request-id': 'interactive-login', 'browser-slot': 'account-two' },
      (text) => output.push(decodeWire(text))
    ).finally(() => clearTimeout(watchdog));
    assert.equal(exit, 0);
    assert.deepEqual(output[1].commands, [
      'attention',
      'status',
      'focus <wait-id>',
      'quit',
    ]);
    assert.equal(output[2].login.state, 'browser-open');
    assert.equal(output[3].attention[0].requestId, 'interactive-login');
    assert.equal(output[4].code, 'jobs-attention-ended');
    assert.deepEqual(output[5], { ok: true });
    assert.equal(output[6].login.state, 'cancelled');
    assert.equal(output[6].login.authentication, 'unverified');
    assert.equal(f.calls.launches.length, 1);
    assert.equal(f.calls.focuses, 1);
    assert.equal(f.calls.closes, 1);
  }
);

for (const locale of ['en', 'ru', 'zh', 'hi']) {
  test(
    `manual login controls expose unverified, unknown and failed closure states in ${locale}`,
    { timeout: 5000 },
    () => {
      const base = {
        values: { browserSlot: 'jobs' },
        browserValid: true,
        capabilities: { manualLogin: true },
        jobLogin: { known: true, busy: false, receipt: { login: null } },
      };
      const render = (jobLogin) =>
        renderInLocale(
          locale,
          React.createElement(JobLoginPanel, {
            state: { ...base, jobLogin: { ...base.jobLogin, ...jobLogin } },
            t: (key) => translate(locale, key),
          })
        );
      const idle = render({});
      assert.match(idle, /data-job-login-state="none"/u);
      assert.ok(idle.includes(translate(locale, 'jobLogin.title')));
      assert.doesNotMatch(idle, /jobLogin\.[a-z]/u);
      const unknown = render({ known: false, error: 'server-required' });
      assert.match(unknown, /disabled="" data-job-login-action="open"/u);
      assert.match(unknown, /data-job-login-state="unknown"/u);
      const active = render({
        receipt: { login: { state: 'browser-open', active: true } },
      });
      assert.ok(active.includes(translate(locale, 'jobLogin.browser-open')));
      assert.doesNotMatch(active, /disabled="" data-job-login-action="close"/u);
      const failure = render({
        receipt: { login: { state: 'close-failed', active: true } },
      });
      assert.ok(failure.includes(translate(locale, 'jobLogin.close-failed')));
      assert.doesNotMatch(
        failure,
        /disabled="" data-job-login-action="close"/u
      );
    }
  );
}

test(
  'manual login controls are absent when the connected server lacks the capability',
  { timeout: 5000 },
  () => {
    assert.equal(
      renderInLocale(
        'en',
        React.createElement(JobLoginPanel, {
          state: {
            capabilities: { manualLogin: false },
            jobLogin: { receipt: null },
          },
          t: (key) => key,
        })
      ),
      ''
    );
  }
);
