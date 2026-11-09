// Offline contextual answer example. Run: node examples/answer-contexts.mjs
// No provider, persistent store, browser or outgoing message is used.
import { planAnswer } from '../js/src/automation/question-answers.js';
import { encodeLinoValue } from '../js/src/transport/lino.js';

const contexts = [
  {
    key: 'currency',
    default: 'RUB',
    choices: [
      {
        id: 'RUB',
        keywords: ['RUB', 'рублях'],
        profile: { salary: '450000 ₽', gross: '530000 ₽' },
      },
      { id: 'USD', keywords: ['USD'], profile: { salary: '$6000' } },
      {
        id: 'USDT',
        keywords: ['USDT', 'blockchain'],
        profile: { salary: '6000 USDT' },
      },
    ],
  },
];
const options = {
  contexts,
  rules: [
    {
      id: 'qa-rule:salary',
      question: 'What salary …?',
      answers: [{ text: '{{salary}}', approved: true }],
    },
    {
      id: 'qa-rule:gross',
      question: 'What gross salary …?',
      answers: [{ text: '{{gross}}', approved: true }],
    },
  ],
};
for (const [question, environment] of [
  ['What salary expectations?', { vacancy: { pay: 'USD' } }],
  ['What salary in USDT?', {}],
  ['What gross salary in USD?', {}],
  ['What salary in RUB or USD?', {}],
]) {
  console.log(
    encodeLinoValue(planAnswer(question, { ...options, ...environment }))
  );
}
