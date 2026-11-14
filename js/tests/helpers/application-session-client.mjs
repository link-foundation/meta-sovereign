import { ApplicationSession } from '../../src/web/application-session.js';
import assert from 'node:assert/strict';

export const applicationSessionStorage = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

/** Lost replies must recover only by status, without replaying the action. */
export const recoverApplicationSession = async (fixture, saved) => {
  const recovered = applicationSessionClient(fixture, saved);
  await recovered.session.recover();
  assert.deepEqual(
    recovered.calls.map(([name]) => name),
    ['status']
  );
  return recovered;
};
export const applicationSessionClient = (
  fixture,
  saved = applicationSessionStorage()
) => {
  const calls = [];
  const api = Object.fromEntries(
    [
      'status',
      'open',
      'read',
      'advance',
      'prefill',
      'mode',
      'close',
      'backup',
      'restore',
      'defer',
      'queue',
      'retry',
    ].map((operation) => [
      `vacancyApplication${operation[0].toUpperCase()}${operation.slice(1)}`,
      async (input) => {
        calls.push([operation, input]);
        // These controller scenarios exercise direct native entry. Language
        // policy has its own full-form fixture and can override this opt-out.
        return fixture.service[`application-${operation}`](
          operation === 'open'
            ? { autoSelectResumeLanguage: false, ...input }
            : input
        );
      },
    ])
  );
  api.vacancyCancel = () => fixture.service.cancel();
  return { api, calls, saved, session: new ApplicationSession(api, saved) };
};
