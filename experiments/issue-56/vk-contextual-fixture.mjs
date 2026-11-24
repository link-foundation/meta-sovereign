import { createMemoryStore } from '../../js/src/storage/universal.js';
import { automationPresets } from '../../js/src/automation/automations.js';
import {
  gratitudeMessage as message,
  gratitudeServer,
} from './vk-gratitude-fixture.mjs';
export const contextualPreset = (kind) =>
  automationPresets().find((a) => a.id === `automation:${kind}`);
export const contextualBody = {
  'first-exchange': 'Привет!',
  wellbeing: 'Как дела?',
  purpose: 'Ты что-то хотел?',
  clarification: '??',
};
export const seedContextual = async (kind, store = createMemoryStore()) => {
  for (const chat of ['41', '42', '2000000001']) {
    const offset = chat === '41' ? 0 : chat === '42' ? 2 : 4;
    const formal = chat === '42';
    const prior =
      kind === 'first-exchange'
        ? formal
          ? 'Здравствуйте'
          : 'Привет'
        : kind === 'clarification'
          ? formal
            ? 'Пишу Вам.'
            : 'Пишу тебе.'
          : formal
            ? 'Кто вы?'
            : 'Кто ты?';
    const outgoing = ['first-exchange', 'clarification'].includes(kind);
    await store.put(
      message(offset + 1, chat, prior, outgoing ? { from_id: 1, out: 1 } : {})
    );
    await store.put(
      message(
        offset + 2,
        chat,
        kind === 'first-exchange' && formal
          ? 'Здравствуйте!'
          : kind === 'purpose' && formal
            ? 'Вы что-то хотели?'
            : contextualBody[kind]
      )
    );
  }
  await store.put(message(7, '43', 'О чём речь?'));
  await store.put(message(8, '45', `${contextualBody[kind]} Другой вопрос?`));
  return store;
};
export const contextualServer = (kind) =>
  gratitudeServer({ seed: () => seedContextual(kind) });
