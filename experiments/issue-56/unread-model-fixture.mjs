import { unreadAnswerFixture } from './unread-answer-fixture.mjs';
import {
  modelQuestion,
  modelRunnerFixture,
  seedModelAnswers,
} from './forms-model-fixture.mjs';

export const modelUnreadRow = {
  strictOptions: false,
  question: { id: '102', body: modelQuestion, outgoing: false },
};
export const modelUnreadHistory = (snapshot) => [
  {
    id: '101',
    body: 'I build accessible interfaces with JavaScript.',
    outgoing: true,
    timestamp: '2026-11-11T09:00:00Z',
  },
  { ...snapshot.question, timestamp: '2026-11-11T10:00:00Z' },
];

/** Stored synthetic CV and injected model only; never starts a local model. */
export const unreadModelFixture = async (options = {}) => {
  const calls = [];
  const env = await unreadAnswerFixture({
    rows: [modelUnreadRow, {}],
    runner: modelRunnerFixture(calls),
    history: modelUnreadHistory,
    ...options,
  });
  const seed = await seedModelAnswers(env.store);
  env.input = {
    ...env.input,
    modelDraft: true,
    approximate: false,
    profileId: seed.profile.id,
  };
  return { ...env, seed, calls };
};

export const withUnreadModel = async (work, options) => {
  const env = await unreadModelFixture(options);
  try {
    return await work(env);
  } finally {
    await env.browser.close();
  }
};
