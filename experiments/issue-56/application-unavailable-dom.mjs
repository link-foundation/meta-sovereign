/** Rendered provider phrases stay distinct from hidden markup and owner content. */
export const changeUnavailableWarning = (kind) => {
  document.querySelector('#fixture-unavailable')?.remove();
  if (kind === 'clear') {
    return;
  }
  const node = document.createElement('p');
  node.id = 'fixture-unavailable';
  node.textContent = 'Вам недоступна эта вакансия';
  document.body.append(node);
  const styles = {
    collapsed: 'height:0;overflow:hidden',
    'display-none': 'display:none',
    'visibility-hidden': 'visibility:hidden',
  };
  if (Object.hasOwn(styles, kind)) {
    node.style.cssText = styles[kind];
  } else if (kind === 'hidden') {
    node.hidden = true;
  } else if (kind === 'aria-hidden') {
    node.setAttribute('aria-hidden', 'true');
  } else if (kind === 'inert') {
    node.inert = true;
  } else if (kind === 'description') {
    node.setAttribute('data-qa', 'vacancy-description');
  } else if (kind === 'owner') {
    node.setAttribute('contenteditable', 'true');
  } else if (kind === 'form') {
    document.querySelector('#native-form').append(node);
  } else if (kind === 'english') {
    node.textContent = 'This vacancy is not available to you';
  } else if (kind === 'english-alternative') {
    node.textContent = 'Vacancy is unavailable for you';
  } else if (kind === 'split') {
    node.replaceChildren('Вам недоступна ', document.createElement('span'));
    node.lastChild.textContent = 'эта вакансия';
  } else if (kind === 'long') {
    node.append(' Additional provider explanation.'.repeat(25));
  } else if (kind === 'unrelated') {
    node.textContent = 'Other vacancies remain available.';
  }
};
