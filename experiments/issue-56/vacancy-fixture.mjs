export const vacancyUrl = 'https://hh.ru/vacancy/123';
export const vacancySnapshotFixture = () => ({
  url: vacancyUrl,
  title: 'Python engineer',
  company: 'Fixture employer',
  description:
    'Build services.\n\nRequired: Python and SQL.\nPreferred: Rust.\nEmployer’s final paragraph stays intact.',
  skills: ['Python', 'SQL'],
  salary: 'от 250 000 ₽',
  location: 'Москва',
  experience: '3–6 лет',
  employment: 'Полная занятость',
  workFormat: 'Удалённо',
  published: '12 ноября 2026',
  capturedAt: '2026-11-12T00:00:00Z',
});
export const searchFixture = (
  url,
  cards = [{ ...vacancySnapshotFixture(), responded: false }]
) => ({ url, cards, empty: cards.length === 0, next: null, challenge: false });
export const gate = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
export const fakeVacancySession = (value, calls = []) => ({
  commander: {
    goto: async (input) => {
      calls.push(input);
      return { navigated: true, verified: true, status: 'ready' };
    },
    evaluate: async () => value,
  },
  close: async () => calls.push('closed'),
});
