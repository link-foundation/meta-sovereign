import { ApplicationSession } from '../../src/web/application-session.js';

export const applicationSessionStorage = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
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
        return fixture.service[`application-${operation}`](input);
      },
    ])
  );
  api.vacancyCancel = () => fixture.service.cancel();
  return { api, calls, saved, session: new ApplicationSession(api, saved) };
};
