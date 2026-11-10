import { saveAnswerProfile } from '../../js/src/automation/question-profiles.js';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';

export const formLinks = {
  resume: 'https://hh.ru/resume/synthetic-owner',
  website: 'https://portfolio.example.test/ada',
  github: 'https://github.com/synthetic-owner',
};
export const linkLabels = [
  'Ссылка на резюме',
  'GitHub',
  'LinkedIn profile',
  'Резюме, портфолио или профиль',
];
export const seedLinkAnswers = async (store) => {
  const profile = await saveAnswerProfile(store, {
    id: 'form-links',
    name: 'Links owner',
    values: formLinks,
  });
  for (const [index, question] of linkLabels.entries()) {
    await saveAnswerRule(store, {
      id: `link-fixture-${index}`,
      question,
      answers: [{ text: 'No', approved: true, count: 1 }],
    });
  }
  return profile;
};
export const linksFixtureHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Requested contact links</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label,input,textarea{display:block;margin:8px 0}input,textarea{width:100%}</style>
<form action="/submit" method="post">
<label>Ссылка на резюме<input name="resumeLink"></label>
<label>GitHub<input name="githubLink"></label>
<label>LinkedIn profile<input name="linkedinLink"></label>
<label>Резюме, портфолио или профиль<textarea name="allLinks">Owner keeps this answer</textarea></label>
<button type="submit">Submit</button></form>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));</script>`;
