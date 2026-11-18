// Finite probe: inspect recognition and token collisions without any account.
import {
  asksQuestion,
  matchQuestion,
  questionWords,
} from '../../js/src/automation/question-match.js';

for (const text of [
  'Where do you live',
  'Где вы живете',
  'आप कहाँ रहते हैं',
  '您住在哪里',
  'धन्यवाद। कृपया अपना अनुभव बताएं',
  '谢谢。请介绍您的经验',
  'We will contact you later.',
  'हम बाद में संपर्क करेंगे।',
]) {
  console.log(JSON.stringify({ text, asks: asksQuestion(text) }));
}
const left = 'इस दिन का अर्थ क्या है?';
const right = 'इस दीन का अर्थ क्या है?';
console.log(
  JSON.stringify({
    left,
    right,
    leftWords: questionWords(left),
    rightWords: questionWords(right),
    match: matchQuestion(left, right),
  })
);
