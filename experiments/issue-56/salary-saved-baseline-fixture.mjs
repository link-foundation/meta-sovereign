export const savedBaselineQuestion =
  'В каком диапазоне рассматриваете предложения? (на руки)';
export const savedBaselineAnswer = 'От 450 000 ₽ в месяц на руки.';
export const savedBaselineOptions = [
  'До 100 тыс. руб.',
  'От 101 до 240 тыс. руб.',
  'Свыше 241 тыс. руб.',
];
export const savedBaselineRule = (
  text = savedBaselineAnswer,
  question = savedBaselineQuestion
) => ({
  id: 'qa-rule:saved-baseline',
  question,
  answers: [{ text, approved: true }],
});
export const savedBaselineInput = {
  question: savedBaselineQuestion,
  options: savedBaselineOptions,
  rules: [savedBaselineRule()],
};
