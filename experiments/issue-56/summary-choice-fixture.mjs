export const summaryChoiceQuestion =
  'Do you have experience designing distributed services?';
export const summaryChoiceOptions = ['YES', 'NO'];
export const summaryChoiceMessage = (extra = {}) => ({
  id: 'msg:hh:accepted:20',
  tokens: ['message', 'hh', 'accepted'],
  source: 'hh',
  chat: 'accepted',
  sender: 'employer-bot',
  timestamp: '2026-11-11T08:00:00Z',
  body: `Your answers:\n${summaryChoiceQuestion}: Yes.`,
  ...extra,
});
export const summaryChoiceInput = {
  source: 'hh',
  chat: '7',
  question: summaryChoiceQuestion,
  options: summaryChoiceOptions,
  strictOptions: true,
};
