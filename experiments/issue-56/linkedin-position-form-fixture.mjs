const options = (values, selected) =>
  values
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`
    )
    .join('');

const months = (selected) =>
  options(
    [
      ['', 'Month'],
      ['jan', 'January'],
      ['apr', 'April'],
      ['dec', 'December'],
    ],
    selected
  );
const years = (selected) =>
  options(
    [
      ['', 'Year'],
      ...['2016', '2018', '2023', '2025'].map((year) => [year, year]),
    ],
    selected
  );

export const linkedinPositionFormHtml = ({
  add,
  changed,
  actions,
}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>LinkedIn position fixture</title></head>
<body><main><dialog open aria-labelledby="editor-title"><h1 id="editor-title">${add ? 'Add experience' : 'Edit experience'}</h1>
<form>
<label>Job title*<input name="title" value="${add ? '' : 'Lead engineer'}" maxlength="100"></label>
<label for="company">Organization*</label><input id="company" name="company" value="${add ? '' : 'Fixture Company'}" maxlength="100">
<label>Location<input name="location" value="${add ? '' : 'London, United Kingdom'}"></label>
<label>Employment type<select name="employment"><option selected>Full-time</option><option>Contract</option></select></label>
<p id="description-label">Description, maximum 2,000 characters</p>
<div id="description" role="textbox" aria-labelledby="description-label" contenteditable="true">${add ? '' : changed ? 'A newer owner description.' : 'Worked on Rust and PostgreSQL.'}</div>
<label>I am currently working in this role<input name="current" type="checkbox" ${add ? '' : 'checked'}></label>
<label>Start month<select name="startMonth">${months(add ? '' : 'jan')}</select></label>
<label>Start year*<select name="startYear">${years(add ? '' : '2023')}</select></label>
<fieldset id="end" ${add ? '' : 'hidden'}>
<label>End month<select name="endMonth">${months('')}</select></label>
<label>End year*<select name="endYear">${years('')}</select></label>
</fieldset>
<button type="button" role="switch" aria-label="Notify your network" aria-checked="true" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')==='false')">Notify network</button>
<button type="button" id="cancel">Cancel</button>
<button type="submit">Save</button>
</form></dialog></main>
<script>
const position = document.querySelector('dialog');
document.querySelector('#cancel').onclick = () => {
  if (${Boolean(actions)}) {
    const warning = document.createElement('dialog');
    warning.innerHTML = '<h2>Discard changes?</h2><button type="button">Discard</button>';
    document.body.append(warning);
    warning.showModal();
    warning.querySelector('button').onclick = () => { warning.close(); position.close(); };
  } else {
    position.close();
  }
};
document.querySelector('form').addEventListener('submit', async (event)=>{
  event.preventDefault();
  window.fixtureSaves = (window.fixtureSaves || 0) + 1;
  if (${Boolean(actions)}) {
    await fetch('/fixture-position-save', {method: 'POST', body: document.querySelector('#description').innerText});
    position.close();
    const notice = document.createElement('p');
    notice.setAttribute('role', 'status');
    notice.textContent = 'Your experience is saved';
    document.querySelector('main').append(notice);
  }
});
document.querySelector('[name=current]').addEventListener('change', (event)=>{
  document.querySelector('#end').hidden=event.currentTarget.checked;
});
</script></body></html>`;
