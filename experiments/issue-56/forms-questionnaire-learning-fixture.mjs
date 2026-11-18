export const learningQuestions =
  '1. Which languages do you use?\n2. Where do you live?';
export const learningAnswers = '1. Rust and Python.\n2. Hanoi.';

/** One owned field and a real local completion, with no automatic submission. */
export const questionnaireLearningHtml = `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Questionnaire learning fixture</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label{white-space:pre-line}textarea,button{display:block;margin:12px 0}</style>
<form><label>${learningQuestions}<textarea name="questionnaireAnswer"></textarea></label>
<button type="submit">Submit</button></form><script>
globalThis.events=[];
for(const name of ['input','change','click','submit'])document.addEventListener(name,()=>events.push(name));
document.querySelector('form').addEventListener('submit',async event=>{
 event.preventDefault();
 const response=await fetch('/learning-submit',{method:'POST'});
 if(response.ok)document.querySelector('form').outerHTML='<p role="status">Your response has been recorded</p>';
});</script>`;

export const observedQuestionnaire = (extra = {}) => ({
  question: learningQuestions,
  text: learningAnswers,
  url: 'https://example.test/questionnaire-learning',
  field: { type: 'textarea', label: learningQuestions },
  evidence: 'form:questionnaire:confirmed',
  ...extra,
});

/** Explicit stdin simulation used only by the isolated MCP fixture. */
export const controlQuestionnaireLearning = async (action, page) => {
  if (new URL(page.url()).pathname !== '/questionnaire-learning') {
    return false;
  }
  if (['edit', 'submit'].includes(action)) {
    await page.locator('[name="questionnaireAnswer"]').fill(learningAnswers);
  }
  if (action === 'submit') {
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page.getByRole('status').waitFor();
  }
  return true;
};
