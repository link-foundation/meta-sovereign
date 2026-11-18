// Finite turn-identity reproduction. Add META_SOVEREIGN_QUESTION_DEBUG=1
// to inspect identifier-only decisions on stderr; no credentials or sends.
import { learnAnswerRules } from '../../js/src/automation/question-learning.js';
import { encodeLinoValue } from '../../js/src/transport/lino.js';

const messages = [
  ['them', 'Расскажите о вашем опыте с Kubernetes.'],
  ['them', 'Мы можем продолжить наше общение?'],
  ['me', 'Здравствуйте!'],
  ['me', 'Да, сопровождал кластер из 12 узлов.'],
].map(([sender, body], index) => ({
  id: `msg:hh:turns:${index}`,
  source: 'hh',
  chat: 'turns',
  sender,
  body,
  timestamp: new Date(Date.UTC(2026, 10, 9, 10, 0, index)).toISOString(),
}));
console.log(encodeLinoValue(learnAnswerRules(messages)));
