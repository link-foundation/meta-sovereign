/** Bounded synthetic employer notice; all links stay intercepted by the fixture. */
export const changeExternalSkipNotice = (kind = 'valid') => {
  document.querySelector('#fixture-external-notice')?.remove();
  if (kind === 'clear') {
    return;
  }
  const alert = document.createElement('div');
  alert.id = 'fixture-external-notice';
  alert.setAttribute('data-qa', 'magritte-alert');
  if (kind === 'hidden') {
    alert.hidden = true;
  }
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.setAttribute('data-qa', 'vacancy-response-link-advertising-cancel');
  cancel.textContent = 'Continue on employer website or cancel';
  alert.append(cancel);
  const add = (href, hidden = false) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = 'Employer application';
    link.hidden = hidden;
    alert.append(link);
  };
  if (kind === 'unsafe') {
    add('javascript:void(0)');
  } else if (kind === 'provider') {
    add('https://hh.ru/vacancy/123');
  } else if (kind === 'credentials') {
    add('https://owner:secret@employer.example/apply');
  } else {
    add('https://employer.example/apply#instructions');
    add('https://hidden.example/apply', true);
    if (kind === 'ambiguous') {
      add('https://another.example/apply');
    }
  }
  document.querySelector('#native-form').append(alert);
};
