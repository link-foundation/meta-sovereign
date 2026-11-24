import { createMemoryStore } from '../../js/src/storage/universal.js';
import { automationPresets } from '../../js/src/automation/automations.js';
import { gratitudeMessage, gratitudeServer } from './vk-gratitude-fixture.mjs';

export const acquaintancePreset = () =>
  automationPresets().find((a) => a.id === 'automation:acquaintance');
export const seedAcquaintance = async (store = createMemoryStore()) => {
  // Earlier identity turns supply independently evidenced address forms.
  for (const [id, chat, body, extra] of [
    [1, '41', 'Кто ты?'],
    [2, '41', 'Мы знакомы?'],
    [3, '42', 'Кто вы?'],
    [4, '42', 'Мы знакомы с вами?'],
    [5, '43', 'Мы знакомы?', { from_id: 1, out: 1 }],
    [6, '2000000001', 'Мы знакомы?', { from_id: 44 }],
    [7, '45', 'Мы знакомы? А где вы работаете?'],
  ]) {
    await store.put(gratitudeMessage(id, chat, body, extra));
  }
  return store;
};
export const acquaintanceServer = () =>
  gratitudeServer({ seed: seedAcquaintance });
