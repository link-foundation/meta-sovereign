import { createMemoryStore } from '../../js/src/storage/universal.js';
import { saveSettings } from '../../js/src/automation/safety.js';
import { diagnosticServer } from './diagnostics-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';

export const protectedSettings = {
  quietHours: { enabled: false, from: '22:00', to: '08:00' },
  timezone: 'UTC',
  optOut: [{ source: 'vk', chat: '201', note: 'Owner opt-out', at: null }],
  cooldownDays: 7,
};

/** Synthetic owner settings; no provider accounts, scheduling or external sends. */
export const safetySettingsFixture = async () => {
  const store = createMemoryStore();
  await saveSettings(store, protectedSettings);
  let refused = false;
  let sends = 0;
  store.flush = async () => {
    if (refused) {
      throw new Error('Fixture settings flush refused');
    }
  };
  const server = await diagnosticServer({
    store,
    automations: {
      scheduler: false,
      send: async () => {
        sends++;
        throw new Error('Fixture must not send');
      },
    },
  });
  return {
    ...server,
    close: async () => {
      refused = false;
      await server.close();
    },
    store,
    refuse: (value) => {
      refused = value;
    },
    stats: () => ({ sends, liveProvider: false }),
  };
};

if (process.argv.includes('--serve-safety')) {
  const fixture = await safetySettingsFixture();
  fixture.refuse(true);
  serveQuestionLinkFixture(fixture);
}
