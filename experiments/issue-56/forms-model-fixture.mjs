import { saveAnswerModel } from '../../js/src/automation/answer-model-config.js';
import { saveAnswerProfile } from '../../js/src/automation/question-profiles.js';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';

export const modelQuestion = 'Describe your background';
export const modelText = 'I build accessible browser interfaces.';
export const modelMarkdownText = '**I build accessible browser interfaces.**';
export const seedModelAnswers = async (store) => {
  await store.put({
    id: 'cv:model-fixture',
    cv: { basics: { name: 'Ada Example', summary: modelText } },
  });
  const profile = await saveAnswerProfile(store, {
    id: 'model-fixture',
    name: 'Model fixture owner',
    values: { name: 'Ada Example' },
  });
  await saveAnswerRule(store, {
    id: 'model-nearby',
    question: 'What interfaces have you built?',
    answers: [{ text: modelText, approved: true, count: 1 }],
  });
  const settings = await saveAnswerModel(store, {
    enabled: true,
    cvId: 'cv:model-fixture',
    revision: null,
  });
  return { settings, profile };
};
export const modelRunnerFixture = (calls) => async (input) => {
  const prompt = JSON.parse(input.prompt);
  calls.push(prompt);
  return {
    drafts: prompt.questions.map(({ id, question }) => ({
      id,
      text: question === modelQuestion ? modelMarkdownText : '',
      missing:
        question === modelQuestion
          ? []
          : ['What starting date can you commit to?'],
      evidence: question === modelQuestion ? ['cv:model-fixture'] : [],
    })),
  };
};
export const modelFixtureHtml = `<!doctype html><html lang="en"><title>Model review fixture</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label,input,textarea{display:block;margin:8px 0;width:95%}</style>
<form action="/submit" method="post"><label>Full name<input name="fullName" value="Owner retains this answer"></label>
<label>${modelQuestion}<textarea name="background"></textarea></label>
<label>Starting date for this vacancy?<input name="starting"></label><button type="submit">Submit</button></form>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,()=>events.push(name));</script>`;
