import { saveAnswerRule } from '../../js/src/automation/question-store.js';

export const matchingQuestions = {
  saved: 'What is your city?',
  asked: 'What is your current city of residence?',
};
export const seedMatchingAnswers = async (store) => {
  for (let index = 0; index < 12; index++) {
    await saveAnswerRule(store, {
      id: `matching-${String(index).padStart(2, '0')}`,
      question: matchingQuestions.saved,
      answers: [
        { text: `Hanoi, district ${index + 1}.`, count: index, approved: true },
      ],
    });
  }
};

export const matchingFixtureHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Matching review</title>
<form action="/submit" method="post">
<label>${matchingQuestions.asked}<textarea name="city"></textarea></label>
<label>WHAT IS YOUR CITY?<textarea name="caseCity"></textarea></label>
<label>${matchingQuestions.asked}<textarea name="ownerCity">Owner keeps this city</textarea></label>
<button type="submit">Submit</button></form>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,()=>events.push(name));</script>`;
