import { matchQuestion } from '../../js/src/automation/question-match.js';

const examples = [
  ['您有相关经验*？', '您有相关经验请发送简历？'],
  ['您有相关经验*？', '您有相关经验面试？'],
  ['您有相关经验*？', '您有相关经验吗请您发送简历？'],
  ['у вас есть опыт*?', 'у вас есть опыт-позвоните?'],
  ['Do you have experience*?', 'Do you have experience-send?'],
  ['Do you have experience*?', 'Do you have experiences?'],
  ['您有相关经验*？', '您有相关经验吗？'],
];
for (const [pattern, question] of examples) {
  console.log(
    JSON.stringify({
      pattern,
      question,
      match: matchQuestion(pattern, question),
    })
  );
}
