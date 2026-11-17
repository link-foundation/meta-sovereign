import { vkMessageLink, vkLinksOf, vkSource } from '../../js/src/sources/vk.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { normalizeAutomation } from '../../js/src/automation/automations.js';

export const vkQuestionLink = {
  question: 'Do you have experience?',
  first: 'https://example.test/assignment?revision=One#Review',
  second: 'https://example.test/assignment?revision=Two#Review',
};
export const vkQuestionRule = {
  id: 'qa-rule:vk-links',
  question: vkQuestionLink.question,
  answers: [{ text: 'Yes', approved: true }],
};
export const vkQuestionAutomation = normalizeAutomation({
  id: 'automation:vk-links',
  name: 'VK attachment review',
  mode: 'auto',
  action: { kind: 'answer-questions' },
  conditions: { mutual: false, cooldownDays: 0 },
  pacing: { typing: false },
});

/** The same native message passes through actual import/live normalization. */
export const vkQuestionMessage = async ({
  via = 'message',
  nativeTime = false,
  type = 'link',
  url = vkQuestionLink.first,
} = {}) => {
  const raw = {
    id: 1,
    peer_id: 7,
    from_id: 8,
    date: nativeTime
      ? Date.parse('2026-11-17T00:00:00Z') / 1000
      : '2026-11-17T00:00:00Z',
    text: vkQuestionLink.question,
    attachments: [
      {
        type,
        [type]:
          type === 'wall'
            ? { owner_id: -9, id: 3, text: 'Assignment instructions' }
            : { url, title: 'Assignment instructions', type: 1 },
      },
    ],
  };
  if (via === 'archive') {
    return (
      await vkSource.parseArchive({
        conversations: [{ peer: { id: 7 }, messages: [raw] }],
      })
    )[0];
  }
  if (via === 'history') {
    return vkLinksOf({ items: [raw] }, 7)[0];
  }
  if (via === 'conversations') {
    return vkLinksOf({ items: [{ last_message: raw }] })[0];
  }
  return vkMessageLink(raw);
};

export const seedVkQuestionLinks = async () => {
  const store = createMemoryStore();
  for (const record of [
    vkQuestionRule,
    vkQuestionAutomation,
    await vkQuestionMessage(),
  ]) {
    await store.put(record);
  }
  return store;
};
