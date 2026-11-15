import { createMemoryStore } from '../../js/src/storage/universal.js';
import { automationPresets } from '../../js/src/automation/automations.js';
import { gratitudeMessage, gratitudeServer } from './vk-gratitude-fixture.mjs';

export const identityPreset = () =>
  automationPresets().find((a) => a.id === 'automation:identity');
export const identityMessage = gratitudeMessage;
export const seedIdentity = async (store = createMemoryStore()) => {
  const messages = [
    identityMessage(1, '41', 'Кто ты?'),
    identityMessage(2, '42', 'А вы кто ?'),
    identityMessage(3, '43', 'Кто ты?', { from_id: 1, out: 1 }),
    identityMessage(4, '2000000001', 'Кто вы?', { from_id: 44 }),
    identityMessage(5, '45', 'Кто вы? А где документы?'),
  ];
  for (const message of messages) {
    await store.put(message);
  }
  return store;
};
export const identityServer = () => gratitudeServer({ seed: seedIdentity });
