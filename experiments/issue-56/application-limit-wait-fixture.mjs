import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createVacancyService } from '../../js/src/jobs/service.js';
import { applicationLimitDraftFixture } from './application-limit-draft-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';

/** Finite fake-clock pulses; no two-hour local timer or provider access. */
export const applicationLimitWaitFixture = (t, options = {}) => {
  const pending = [];
  const wait = (ms, signal) =>
    new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const entry = {
        ms,
        finish: () => {
          cleanup();
          resolve();
        },
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        pending.splice(pending.indexOf(entry), 1);
      };
      signal.addEventListener('abort', abort, { once: true });
      pending.push(entry);
    });
  const fixture = applicationLimitDraftFixture(t, {
    ...options,
    application: { ...options.application, limitWait: wait },
  });
  fixture.pendingWaits = pending;
  fixture.state.refreshes = 0;
  const originalOpen = fixture.serviceOptions.openSession;
  const originalDispatch = fixture.serviceOptions.application.dispatch;
  fixture.serviceOptions.openSession = async (input) => {
    const browser = await originalOpen(input);
    browser.page.waitForFunction = async (predicate, input) => {
      assert.equal(typeof predicate, 'function');
      assert.equal(input.vacancy, 'https://hh.ru/vacancy/123');
      assert.notEqual(input.documentKey, fixture.state.page.documentKey);
    };
    return browser;
  };
  fixture.serviceOptions.application.dispatch = async (...args) => {
    if (args[2] !== 'limitRefresh') {
      return originalDispatch(...args);
    }
    await fixture.hooks.refresh?.();
    if (fixture.hooks.refuseRefresh) {
      return { navigated: false };
    }
    fixture.state.refreshes++;
    fixture.state.page.documentKey = 'refreshed-limit-document';
    fixture.state.page.dailyLimit = false;
    fixture.state.page.error = null;
    for (const field of fixture.state.fields.slice(1)) {
      field.value = '';
    }
    return { navigated: true };
  };
  fixture.service = createVacancyService(fixture.serviceOptions);
  return Object.assign(fixture, {
    async waiting() {
      return this.begin(await this.limited(await this.answered()));
    },
    async begin(receipt, extra = {}) {
      return fixture.service['application-wait'](
        applicationIdentity(receipt, {
          action: 'start',
          waitId: 'finite-limit-wait',
          confirm: true,
          ...extra,
        })
      );
    },
    async pulse(now = fixture.clock.value + 1000) {
      assert.equal(
        pending.length,
        1,
        'Exactly one finite wait is outstanding.'
      );
      fixture.clock.value = now;
      pending[0].finish();
      for (let count = 0; count < 1000; count++) {
        await setImmediate();
        if (pending.length || !fixture.service) {
          return;
        }
        const status = await fixture.service['application-status']({
          url: 'https://hh.ru/vacancy/123',
          requestId: 'fixture-application',
        });
        if (!['waiting', 'refreshing'].includes(status.limitWait?.phase)) {
          return status;
        }
      }
      throw new Error('Finite limit pulse did not settle.');
    },
    stopWait: (receipt) =>
      fixture.service['application-wait'](
        applicationIdentity(receipt, {
          action: 'stop',
          waitId: receipt.limitWait.id,
        })
      ),
  });
};
