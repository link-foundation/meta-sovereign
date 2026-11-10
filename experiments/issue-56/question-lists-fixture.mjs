// Small synthetic questionnaire; no credentials or provider operations.
export const questions = [
  'Which languages do you use?',
  'If Python, describe one project.',
  'Where do you live?',
].join('\n');
export const answers = '1. Python.\n   Built a search service.\n2. Hanoi.';
export const questionnaireMessages = (source = 'hh') =>
  [questions, answers].map((body, index) => ({
    id: `msg:${source}:questionnaire:${index + 1}`,
    source,
    chat: 'questionnaire',
    sender: index ? 'me' : 'interviewer',
    body,
    timestamp: `2026-11-09T10:00:0${index + 1}Z`,
  }));
