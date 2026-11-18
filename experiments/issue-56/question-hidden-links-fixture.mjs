export const hiddenLink = {
  question: 'Do you have distributed systems experience?',
  first: 'https://company.test/information',
  second: 'https://other.test/assignment',
};

/** Preserve visible text while changing only an actual native anchor target. */
export const mountHiddenQuestionLink = (target) => {
  const bubble = document.querySelector('[data-qa="chat-bubble-text"]');
  const anchor = document.createElement('a');
  anchor.href = target;
  anchor.textContent = 'distributed systems';
  anchor.style.display = 'contents';
  bubble.replaceChildren('Do you have ', anchor, ' experience?');
};
