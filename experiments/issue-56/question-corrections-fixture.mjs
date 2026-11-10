export const projectQuestion = 'Расскажите о вашем проекте с ИИ?';
export const searchQuestion = 'Какой у вас опыт с поиском?';
export const projectAnswer = 'Разработал помощника для анализа документов.';
export const searchAnswer =
  'Построил гибридный поиск по техническим материалам.';
export const apology =
  'Прошу прощения: предыдущий черновик был отправлен по ошибке.';
export const wrongAnswer = 'Исторический пример, который владелец исправил.';
export const correctedRules = [
  {
    id: 'qa-rule:owner-project',
    question: projectQuestion,
    answers: [{ text: projectAnswer, canonical: true, approved: true }],
  },
  {
    id: 'qa-rule:owner-search',
    question: searchQuestion,
    questions: ['Расскажите об опыте поиска?'],
    answers: [{ text: searchAnswer, canonical: true, approved: true }],
  },
];
export const correctionMessages = (source = 'hh') =>
  [
    ['recruiter', projectQuestion],
    ['me', wrongAnswer],
    ['recruiter', searchQuestion],
    ['me', `${apology}\n\n${projectAnswer}\n\n${searchAnswer}`],
    ['bot', `Ваши ответы:\n${projectQuestion}: *${wrongAnswer}*`],
  ].map(([sender, body], index) => ({
    id: `msg:${source}:corrected:${index + 1}`,
    source,
    chat: 'corrected',
    sender,
    body,
    timestamp: new Date(Date.UTC(2026, 10, 9, 12, 0, index)).toISOString(),
  }));
