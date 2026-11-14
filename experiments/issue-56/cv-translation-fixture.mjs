import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVacancyService } from '../../js/src/jobs/service.js';
import { randomUUID } from 'node:crypto';

export const cvTranslationFixture = () => {
  const store = createMemoryStore();
  const calls = { resolve: [], translate: [], drained: 0 };
  const modes = {
    fail: '',
    invalid: 'formal-ai',
    wait: false,
    model: 'gpt-6-luna',
  };
  const adapters = {
    resolve: async (provider, models) => {
      calls.resolve.push(provider);
      return {
        model:
          provider === 'haiku'
            ? (models.haiku ?? 'claude-haiku-5-5')
            : provider === 'luna'
              ? (models.luna ?? modes.model)
              : '0.355.34',
        cacheable: true,
      };
    },
    translate: async (provider, descriptor, input, signal) => {
      calls.translate.push({ provider, model: descriptor.model, ...input });
      if (modes.wait) {
        await new Promise((resolve, reject) => {
          const done = () => {
            calls.drained++;
            reject(new Error('fixture aborted'));
          };
          signal.addEventListener('abort', done, { once: true });
          if (signal.aborted) {
            done();
          }
        });
      }
      if (modes.fail === provider) {
        throw new Error('private-fixture-detail');
      }
      return {
        model: descriptor.model,
        outputs: input.texts.map((_text) =>
          provider === modes.invalid
            ? 'response:translate'
            : input.to === 'en'
              ? `Developed software with JavaScript. ${provider}`
              : `Разрабатывал программное обеспечение на JavaScript. ${provider}`
        ),
      };
    },
  };
  const create = () =>
    createVacancyService({ store, cvTranslation: { adapters } });
  return {
    store,
    calls,
    modes,
    adapters,
    create,
    service: create(),
    input: {
      requestId: randomUUID(),
      browserSlot: 'jobs',
      from: 'ru',
      to: 'en',
      texts: ['Разрабатывал программное обеспечение на JavaScript.'],
    },
  };
};
