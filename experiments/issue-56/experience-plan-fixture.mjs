import { setTimeout as delay } from 'node:timers/promises';
import { createMemoryStore } from '../../js/src/storage/index.js';
import { saveExperienceDocument } from '../../js/src/cv/experience-store.js';
import { experiencePlanRunning } from '../../js/src/cv/experience-plan-record.js';
import { experienceDocumentFixture } from './experience-document-fixture.mjs';

export const experiencePlanModels = {
  haiku: 'claude-haiku-5-5',
  luna: 'gpt-6-luna',
  'formal-ai': '0.355.34',
};
export const experiencePlanPhrases = new Map([
  ['ООО «ЕВИРМА»', 'Evirma LLC'],
  ['Руководитель команды разработки', 'Development Team Lead'],
  [
    'Руководство командой.\nТехнологии: CI/CD, C/C++, .NET',
    'Leading a team.\nTools: CI/CD, C/C++, .NET',
  ],
  ['Москва', 'Moscow'],
  ['Проектирование систем.', 'Designing systems.'],
  ['Новая компания', 'New Company'],
]);
export const experiencePlanFixture = async (options = {}) => {
  const store = options.store ?? createMemoryStore();
  const hh = experienceDocumentFixture();
  const linkedin = experienceDocumentFixture('linkedin');
  hh.source.language = 'ru';
  hh.profile.name = 'Иван Примеров';
  hh.profile.about = 'Проектирование систем.';
  Object.assign(hh.jobs[0], {
    company: 'ООО «ЕВИРМА»',
    title: 'Руководитель команды разработки',
    location: 'Москва',
    description: 'Руководство командой.\nТехнологии: CI/CD, C/C++, .NET',
    skills: ['CI/CD', '.NET'],
  });
  hh.jobs.push({
    ...globalThis.structuredClone(hh.jobs[0]),
    company: 'Новая компания',
    start: '2020-01',
    end: '2021-02',
    current: false,
  });
  linkedin.jobs[0].skills.push('Target-only skill');
  linkedin.jobs.push({
    company: 'Target-only Company',
    title: 'Engineer',
    start: '2017-01',
    end: '2018-01',
  });
  const left = await saveExperienceDocument(store, hh);
  const right = await saveExperienceDocument(store, linkedin);
  const calls = [];
  const adapters = {
    resolve: async (provider, _models, signal) => {
      signal.throwIfAborted();
      calls.push({ kind: 'resolve', provider });
      return { model: experiencePlanModels[provider], cacheable: true };
    },
    translate: async (provider, descriptor, input, signal) => {
      calls.push({ kind: 'translate', provider, input });
      if (options.translate) {
        return options.translate(provider, descriptor, input, signal);
      }
      const dictionary =
        input.to === 'en'
          ? experiencePlanPhrases
          : new Map([...experiencePlanPhrases].map(([ru, en]) => [en, ru]));
      return {
        model: descriptor.model,
        outputs: input.texts.map((source) =>
          provider === 'formal-ai'
            ? 'web search requested'
            : provider === 'haiku' && source.includes('\n')
              ? 'I could not translate: translation gap'
              : (dictionary.get(source) ??
                (input.to === 'en'
                  ? 'Reviewed English text.'
                  : 'Проверенный русский текст.'))
        ),
      };
    },
  };
  return {
    store,
    hh,
    linkedin,
    calls,
    adapters,
    input: (requestId = 'experience-plan-fixture', to = 'linkedin') => ({
      requestId,
      to,
      hh: left.revision,
      linkedin: right.revision,
      asOf: '2026-11',
    }),
  };
};
export const settledExperiencePlan = async (service, requestId) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await service.status({ requestId });
    if (!experiencePlanRunning(result)) {
      return result;
    }
    await delay(1);
  }
  throw new Error('The finite planning fixture did not settle.');
};
