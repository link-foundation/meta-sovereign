import { browserQuestion } from './question-browser-fixture.mjs';

export const salaryVacancyQuestion = 'What are your salary expectations?';
export const salaryVacancyAnswer = 'From $6 000 net per month.';
export const salaryVacancyUrl = 'https://hh.ru/vacancy/123';
export const salaryVacancySnapshot = (url = salaryVacancyUrl, patch = {}) => ({
  url,
  title: 'Platform engineer',
  company: 'Example employer',
  description: 'Build reliable services for European customers.',
  salary: '5 000–8 000 USD per month',
  skills: ['JavaScript'],
  capturedAt: '2026-11-17T10:00:00Z',
  ...patch,
});
export const salaryVacancyQuestionSnapshot = (patch = {}) => ({
  ...browserQuestion(),
  question: { id: '101', body: salaryVacancyQuestion, outgoing: false },
  strictOptions: false,
  answerOptions: [],
  noticeContext: {
    company: 'Example employer',
    vacancy: 'Platform engineer',
    vacancyUrl: salaryVacancyUrl,
    canReply: true,
  },
  ...patch,
});
