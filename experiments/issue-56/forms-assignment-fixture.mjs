import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { saveAnswerModel } from '../../js/src/automation/answer-model-config.js';
import {
  formModelField,
  formModelInspection,
} from '../../js/tests/helpers/forms-plan-inspection.mjs';

export const assignmentRepository =
  'https://github.com/fixture-owner/reviewed-task';
export const assignmentTask =
  'Test assignment: design a small inventory service. Describe the API, persistence and verification approach.';
export const assignmentReceipt = (name = 'fixture-owner/reviewed-task') => ({
  id: 418,
  full_name: name,
  html_url: `https://github.com/${name}`,
});
export const verifyAssignmentFixture = async (name) => {
  if (name.endsWith('/missing')) {
    throw Object.assign(new Error('Fixture repository does not exist.'), {
      code: 'form-assignment-unverified',
    });
  }
  return assignmentReceipt(name);
};
export const assignmentInspection = (task = assignmentTask) => {
  const report = formModelInspection([
    formModelField('Full name', {
      id: 'frame-1:name',
      tag: 'input',
      name: 'name',
      index: 0,
    }),
    formModelField('English level?', {
      id: 'frame-1:english',
      tag: 'input',
      name: 'english',
      index: 1,
    }),
    formModelField('Link to completed test assignment', {
      id: 'frame-1:task',
      tag: 'input',
      type: 'url',
      name: 'task',
      index: 2,
    }),
    formModelField('GitHub profile link', {
      id: 'frame-1:github',
      tag: 'input',
      type: 'url',
      name: 'github',
      index: 3,
    }),
    formModelField('PDF résumé', {
      id: 'frame-1:resume',
      tag: 'input',
      type: 'file',
      value: null,
      valueOmitted: 'file',
      name: 'resume',
      index: 4,
      upload: { accept: '.pdf', directory: false, complete: true, files: [] },
    }),
  ]);
  report.frames[0].intro = task;
  return report;
};
export const seedAssignmentAnswers = async (store) => {
  await saveAnswerRule(store, {
    id: 'qa-rule:assignment-english',
    question: 'English level?',
    answers: [{ text: 'B2', approved: true, count: 1 }],
  });
  await saveAnswerRule(store, {
    id: 'qa-rule:old-task',
    question: 'Link to completed test assignment',
    answers: [
      {
        text: 'https://github.com/fixture-owner/unrelated-task',
        approved: true,
        count: 1,
      },
    ],
  });
  await saveAnswerModel(store, {
    revision: null,
    enabled: true,
    model: 'fixture-model',
  });
};
export const assignmentFixtureHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Application</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px auto;padding:12px}label,input,button{display:block;margin:12px 0}input{padding:8px;max-width:95%}</style>
<form><h1>Application</h1><p>${assignmentTask}</p>
<label>Full name<input name="name" value="Owner keeps this text"></label>
<label>English level?<input name="english"></label>
<label>Link to completed test assignment<input name="task" type="url"></label>
<label>GitHub profile link<input name="github" type="url"></label>
<label>PDF résumé<input name="resume" type="file" accept=".pdf"></label>
<button type="submit">Submit</button></form><script>
globalThis.submissions=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();globalThis.submissions++;};
</script></html>`;
