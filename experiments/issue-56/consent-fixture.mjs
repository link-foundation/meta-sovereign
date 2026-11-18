import assert from 'node:assert/strict';
import { saveSettings, SETTINGS_ID } from '../../js/src/automation/safety.js';

export const consentOutcome = (promise) =>
  promise.then(
    (result) => ({ result }),
    (error) => ({ error })
  );

export const refuseConsentReads = (store, message) => {
  const get = store.get.bind(store);
  store.get = (id) => {
    if (id === SETTINGS_ID) {
      throw new Error(message);
    }
    return get(id);
  };
};

export const withdrawConsent = (store, target, scope = 'chat') =>
  saveSettings(store, {
    optOut: [
      {
        source: target.source,
        [scope]: scope === 'chat' ? target.chat : (target.contact ?? target.to),
      },
    ],
  });

export const assertConsentRefusal = ({ result, error }, code = 'opted-out') => {
  assert.equal(result, undefined);
  assert.equal(error?.code, code);
  assert.equal(error.fallback, false);
  assert.equal(error.ambiguous, undefined);
};

/** A single finite awaited phase; fixture owners release and drain it. */
export const consentBarrier = (stage) => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  return {
    entered,
    release,
    wait: async (at) => {
      if (at === stage) {
        entered.resolve();
        await release.promise;
      }
    },
  };
};
