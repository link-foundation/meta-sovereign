export const question = 'When can you start work after an offer?';
export const preferred = 'Within one to two weeks of an offer.';
export const aliases = [
  'One or two weeks after an offer.',
  'After an offer, in 1–2 weeks.',
];
export const wordingRule = () => ({
  id: 'qa-rule:wording-fixture',
  question,
  answers: [
    { text: preferred, count: 0, approved: true, equivalents: [...aliases] },
  ],
});
export const wordingMessages = () =>
  Array.from({ length: 8 }, (_, index) => ({
    id: `msg:hh:wording:${index}`,
    source: 'hh',
    chat: 'wording',
    sender: index % 2 ? 'me' : 'them',
    body: index % 2 ? aliases[(index >> 1) % 2] : question,
    timestamp: new Date(Date.UTC(2026, 10, 9, 12, 0, index)).toISOString(),
  }));
