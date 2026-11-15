import assert from 'node:assert/strict';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { diagnosticServer } from './diagnostics-fixture.mjs';

export const tokenFixtureValue = 'vk_fixture_user_token_123456789';
export const tokenInspection = (messages = true) => ({
  verdict: messages ? 'messages' : 'no-messages',
  user: { id: 42, name: 'Fixture User' },
  offline: true,
});
export const waitForToken = async (
  service,
  predicate = (s) => !['waiting', 'validating'].includes(s.state)
) => {
  for (let count = 0; count < 300; count++) {
    const result = service.read ? service.read() : await service();
    if (predicate(result)) {
      return result;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
  }
  assert.fail('owned synthetic token task did not settle');
};
export const vkTokenFixture = async (options = {}) => {
  const store = createMemoryStore();
  const effects = { windows: 0, inspections: 0, liveProvider: false };
  const fixture = await diagnosticServer({
    store,
    secretPassphrase: 'synthetic-token-fixture-passphrase',
    vkToken: {
      openAuthorization: ({ signal }) => {
        effects.windows++;
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        );
      },
      inspect: async ({ token, signal }) => {
        effects.inspections++;
        if (token.startsWith('hold_')) {
          await new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            })
          );
        }
        return tokenInspection(!token.startsWith('no_messages_'));
      },
    },
    ...options,
  });
  return { ...fixture, store, effects };
};
