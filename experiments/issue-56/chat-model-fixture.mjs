import { normalizeAutomation } from '../../js/src/automation/automations.js';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import {
  seedModelAnswers,
  modelText,
  modelRunnerFixture,
} from './forms-model-fixture.mjs';

export const knownChatQuestion = 'What is your English level?';
export const openChatQuestion = 'Describe your background';
export const chatModelTargets = [{ source: 'hh', chat: 'model-chat' }];
export const chatModelNow = new Date('2026-11-11T04:00:00Z');
export { modelText };
export const chatModelMessage = (id, body, extra = {}) => ({
  id: `msg:hh:model-chat:${id}`,
  source: 'hh',
  chat: 'model-chat',
  chatName: 'Employer questions',
  sender: 'recruiter',
  body,
  timestamp: `2026-11-11T03:00:${String(id).padStart(2, '0')}Z`,
  ...extra,
});
export const seedChatModel = async (
  store,
  { split = true, openOnly = false } = {}
) => {
  const seeded = await seedModelAnswers(store);
  await saveAnswerRule(store, {
    id: 'chat-english',
    question: knownChatQuestion,
    answers: [{ text: 'My English level is B2.', approved: true }],
  });
  const automation = normalizeAutomation({
    id: 'model-chat',
    name: 'Review employer questions',
    mode: 'safe',
    triggers: [{ kind: 'manual' }, { kind: 'chat-menu' }],
    conditions: { mutual: false, cooldownDays: 0 },
    pacing: { typing: false, minDelayMs: 0, maxDelayMs: 0 },
    action: {
      kind: 'answer-questions',
      modelDraft: true,
      approximate: false,
      profileId: seeded.profile.id,
    },
  });
  await store.put(automation);
  await store.put(
    chatModelMessage(1, 'I am interested.', { sender: 'me', outgoing: true })
  );
  const messages = openOnly
    ? [openChatQuestion]
    : split
      ? [knownChatQuestion, openChatQuestion]
      : [`${knownChatQuestion}\n${openChatQuestion}`];
  for (const [index, body] of messages.entries()) {
    await store.put(chatModelMessage(index + 2, body));
  }
  const calls = [];
  return { ...seeded, automation, calls, runner: modelRunnerFixture(calls) };
};
