import {
  question,
  preferred,
  aliases,
  wordingMessages,
} from './answer-equivalents-fixture.mjs';

export { question, preferred, aliases };
export const unrelated =
  'I measure service performance using latency and throughput.';
export const availabilityRule = () => ({
  id: 'qa-rule:availability-fixture',
  question,
  answers: [
    {
      text: unrelated,
      count: 9,
      approved: true,
      evidence: ['fixture:unrelated'],
    },
    { text: preferred, count: 1, approved: true, evidence: ['fixture:timing'] },
  ],
});
export const availabilityMessages = () => [
  ...wordingMessages(),
  ...[question, unrelated].map((body, index) => ({
    id: `msg:hh:wording:${index + 8}`,
    source: 'hh',
    chat: 'wording',
    sender: index ? 'me' : 'them',
    body,
    timestamp: new Date(Date.UTC(2026, 10, 9, 12, 0, index + 8)).toISOString(),
  })),
];
