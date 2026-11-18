import { saveAnswerRule } from '../../js/src/automation/question-store.js';

export const subjectQuestions = {
  saved:
    'How many years of commercial development experience do you have with Go?',
  wrong:
    'How many years of commercial development experience do you have with C#?',
  correct:
    'How many years of commercial development experience do you have with Golang?',
};
export const seedSubjectAnswers = (store) =>
  saveAnswerRule(store, {
    id: 'subject-go',
    question: subjectQuestions.saved,
    answers: [
      { text: 'Three years building Go services', approved: true, count: 3 },
    ],
  });
export const subjectFixtureHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Question subjects</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label,input,textarea{display:block;margin:8px 0}textarea{width:100%}</style>
<form action="/submit" method="post">
<label>${subjectQuestions.wrong}<textarea name="wrongTechnology"></textarea></label>
<label>${subjectQuestions.correct}<textarea name="rightTechnology"></textarea></label>
<label>${subjectQuestions.correct}<textarea name="ownerTechnology">Owner keeps this answer</textarea></label>
<button type="submit">Submit</button></form>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,()=>events.push(name));</script>`;
