import { applicationResumeOptions } from './application-resume-options-fixture.mjs';

/** Synthetic native controls use the pinned reference's observed attributes. */
const installChooser = (options) => {
  const doc = globalThis.document;
  globalThis.resumeMenus = 0;
  globalThis.resumeChoices = 0;
  const group = doc.createElement('div');
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  const title = doc.createElement('span');
  title.dataset.qa = 'resume-title';
  title.textContent = options[0].title;
  toggle.append(title);
  const list = doc.createElement('div');
  list.dataset.qa = 'magritte-select-option-list';
  list.hidden = true;
  for (const row of options) {
    const option = doc.createElement('div');
    option.role = 'option';
    option.dataset.qa = `magritte-select-option-${row.hash}`;
    const radio = doc.createElement('input');
    radio.type = 'radio';
    radio.name = 'native-resume';
    radio.value = row.hash;
    radio.checked = row.checked;
    const label = doc.createElement('span');
    label.dataset.qa = 'resume-title';
    label.textContent = row.title;
    option.append(radio, label);
    option.onclick = () => {
      radio.checked = true;
      title.textContent = row.title;
      list.hidden = true;
      globalThis.resumeChoices++;
    };
    list.append(option);
  }
  toggle.onclick = () => {
    list.hidden = !list.hidden;
    globalThis.resumeMenus++;
  };
  group.append(toggle, list);
  doc.querySelector('#native-form').prepend(group);
};

export const applicationResumeHtml = () =>
  `(${installChooser.toString()})(${JSON.stringify(applicationResumeOptions())});`;
