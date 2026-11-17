export const salaryOptionConfig = {
  enabled: true,
  approved: true,
  defaultCurrency: 'USD',
  currencies: [{ code: 'USD', keywords: ['USD'], net: 6000, gross: 7100 }],
};
export const salaryBothQuestion =
  'What salary in USD net and gross do you expect?';
export const salaryBothChoices = ['USD 5000–8000', 'USD 8001–10000'];
export const salaryGapChoices = ['USD 0–5000', 'USD 6500–8000'];
export const salaryAlternativeChoice = 'USD 5000 or 8000';

export const salaryOptionHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Salary range review</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}fieldset,label,select{display:block;margin:16px 0}select{max-width:100%}</style>
<form action="/submit" method="post"><h1>Salary range review</h1>
<label>${salaryBothQuestion}<select name="both"><option value="">Choose a range</option>${salaryBothChoices.map((label, i) => `<option value="${i}">${label}</option>`).join('')}</select></label>
<label>${salaryBothQuestion}<select name="ambiguous"><option value="">Choose a range</option><option value="ambiguous">${salaryAlternativeChoice}</option></select></label>
<fieldset><legend>What salary in USD net do you expect?</legend>${salaryGapChoices.map((label, i) => `<label><input type="radio" name="nearest" value="${i}">${label}</label>`).join('')}</fieldset>
<label>Owner comment<input name="owner" value="Keep my explanation"></label>
<button type="submit">Submit</button></form>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));</script>`;
