/** Synthetic HH warning variants, including the collapsed block in every popup. */
export const changeResumeVisibilityWarning = (kind) => {
  document.querySelector('#fixture-resume-warning')?.remove();
  if (kind === 'clear') {
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.id = 'fixture-resume-warning';
  const warning = document.createElement('p');
  warning.setAttribute('data-qa', 'hidden-resume-warning');
  warning.textContent = 'Чтобы откликнуться, поменяйте видимость резюме.';
  wrapper.append(warning);
  const form = document.querySelector('#native-form');
  form.append(wrapper);
  const styles = {
    collapsed: 'height:0;overflow:hidden',
    'display-none': 'display:none',
    'visibility-hidden': 'visibility:hidden',
  };
  if (Object.hasOwn(styles, kind)) {
    wrapper.style.cssText = styles[kind];
  } else if (kind === 'hidden') {
    wrapper.hidden = true;
  } else if (kind === 'aria-hidden') {
    wrapper.setAttribute('aria-hidden', 'true');
  } else if (kind === 'inert') {
    wrapper.inert = true;
  } else if (kind === 'empty') {
    warning.textContent = ' ';
  } else if (kind === 'unrelated') {
    warning.removeAttribute('data-qa');
    warning.textContent = 'Owner résumé details';
  } else if (kind === 'outside') {
    form.before(wrapper);
  } else if (kind === 'english') {
    warning.removeAttribute('data-qa');
    warning.textContent =
      'Change the visibility of your resume to all employers.';
  } else if (kind === 'russian') {
    warning.removeAttribute('data-qa');
  } else if (kind === 'localized') {
    warning.textContent = '请将简历设为对所有雇主可见。';
  } else if (kind === 'script') {
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = '"change resume visibility"';
    warning.replaceWith(script);
  }
};
