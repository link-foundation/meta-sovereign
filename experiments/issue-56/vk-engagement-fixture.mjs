import { createMemoryStore } from '../../js/src/storage/universal.js';
import { automationPresets } from '../../js/src/automation/automations.js';
import {
  gratitudeMessage as message,
  gratitudeServer,
} from './vk-gratitude-fixture.mjs';

export const engagementPreset = () =>
  automationPresets().find((a) => a.id === 'automation:engagement');
export const seedEngagement = async (store = createMemoryStore()) => {
  for (const [index, chat] of ['41', '42', '2000000001'].entries()) {
    const offset = index * 3;
    await store.put(
      message(offset + 1, chat, chat === '42' ? 'Кто вы?' : 'Кто ты?')
    );
    await store.put(
      message(offset + 2, chat, 'Мы общались ранее?', { from_id: 1, out: 1 })
    );
    await store.put(message(offset + 3, chat, 'Нет вроде'));
  }
  await store.put(message(10, '43', 'Нет'));
  await store.put(
    message(11, '45', 'Мы общались ранее?', { from_id: 1, out: 1 })
  );
  await store.put(message(12, '45', 'Нет, у меня другой вопрос?'));
  return store;
};
export const engagementServer = (options = {}) =>
  gratitudeServer({
    seed: seedEngagement,
    sendResult: (_params, { calls }) => 918 + calls.length,
    ...options,
  });
