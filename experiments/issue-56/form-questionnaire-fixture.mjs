import { saveAnswerProfile } from '../../js/src/automation/question-profiles.js';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';

export const formQuestions = [
  'What salary in USD do you expect?',
  'What is your email?',
  'What is your GitHub?',
];
export const formQuestionnaire = formQuestions
  .map((part, i) => `${i + 1}. ${part}`)
  .join('\n');
export const formQuestionnaireHtml = `<!doctype html><html lang="en"><meta charset="utf-8">
  <title>Synthetic questionnaire</title><form action="/submit" method="post">
  <label style="white-space:pre-line">${formQuestionnaire}<textarea name="questionnaire"></textarea></label>
  <label>${formQuestionnaire.replaceAll('\n', '<br>')}<textarea name="questionnaireBr"></textarea></label>
  <button>Submit</button></form><script>globalThis.events=[];
  for(const name of ['input','change','click','submit'])document.addEventListener(name,()=>events.push(name));</script>`;
export const seedFormQuestionnaire = async (store) => {
  const profile = await saveAnswerProfile(store, {
    id: 'questionnaire',
    name: 'Reviewed synthetic owner',
    values: {
      salary: '6000 USD net per month',
      email: 'owner@example.test',
      github: 'https://github.com/example-owner',
    },
  });
  for (const [i, key] of ['email', 'github'].entries()) {
    await saveAnswerRule(store, {
      id: `questionnaire-${key}`,
      question: formQuestions[i + 1],
      answers: [{ text: `{{${key}}}`, approved: true }],
    });
  }
  return profile;
};
