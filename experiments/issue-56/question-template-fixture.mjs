/** Finite saved-template examples shared by transport and native UI checks. */
export const templateExample = {
  id: 'location-template',
  pattern: 'ГДЕ … ЖИВЁТ*?',
  question: 'Где вы сейчас живете?',
  answer: 'Живу во Вьетнаме.',
};

export const templateLinkExample = {
  id: 'experience-link-template',
  pattern: 'Do you have https://company.test … experience?',
  question: 'Do you have https://company.test https://other.test experience?',
  answer: 'Five years.',
};

export const templateRule = (extra = {}) => ({
  id: templateExample.id,
  question: templateExample.pattern,
  answers: [{ text: templateExample.answer, approved: true }],
  ...extra,
});

export const mountTemplateQuestion = (body) => {
  const bubble = document.querySelector('[data-qa="chat-bubble-text"]');
  if (!bubble) {
    throw new Error('Missing synthetic native question');
  }
  bubble.textContent = body;
};
