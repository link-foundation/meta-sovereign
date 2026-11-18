/** Native close admission. Challenge values, prose and markup are never read. */
/* eslint-disable max-lines-per-function -- The document boundary and its DOM helpers serialize together. */
export const applicationLimitDocument = (target, input) => {
  const { document: doc } = globalThis;
  const visible = (node) => {
    if (
      !node ||
      !node.getClientRects().length ||
      node.closest('[hidden],[inert],[aria-hidden="true"]')
    ) {
      return false;
    }
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = globalThis.getComputedStyle(parent);
      if (
        style.display === 'none' ||
        ['hidden', 'collapse'].includes(style.visibility) ||
        style.opacity === '0'
      ) {
        return false;
      }
    }
    return true;
  };
  const nodes = (selector) =>
    [...doc.querySelectorAll(selector)].filter(visible);
  const current = new URL(globalThis.location.href);
  const expected = new URL(input.url);
  const documentKey =
    doc[Symbol.for('meta-sovereign.jobs.application-document.v1')];
  const validLocation = () =>
    expected.origin === 'https://hh.ru' &&
    current.origin === expected.origin &&
    !current.username &&
    !current.password &&
    (current.pathname === expected.pathname ||
      (current.pathname === '/applicant/vacancy_response' &&
        current.searchParams.getAll('vacancyId').length === 1 &&
        current.searchParams.get('vacancyId') ===
          expected.pathname.split('/').at(-1)));
  const submits = nodes(input.submit);
  const form = submits.length === 1 ? submits[0].form : null;
  const challenges = nodes(
    'input[data-qa="account-captcha-input"],input[name="captchaText"]'
  );
  const dialog =
    challenges.length === 1 ? challenges[0].closest('[role="dialog"]') : null;
  const daily =
    nodes('[data-qa-popup-error-code="negotiations-limit-exceeded"]').length >
    0;
  const known =
    input.knownLimit?.documentKey === documentKey &&
    input.knownLimit?.until === input.until;
  const forbidden =
    'input[data-qa="account-captcha-input"],input[name="captchaText"],input[name*="captcha"],iframe,[data-qa="captcha"],.smart-captcha,[data-smartcaptcha],#captcha-form,form[action*="checkcaptcha"],.CheckboxCaptcha,.TextinputCaptcha,.g-recaptcha,.h-captcha,.cf-turnstile,input[type="password"],input[type="file"]';
  const unsafeForm = () =>
    form.matches(forbidden) || form.querySelector(forbidden);
  const invalidBoundary = () =>
    !validLocation() ||
    documentKey !== input.documentKey ||
    !form ||
    !visible(form) ||
    !dialog ||
    form.contains(dialog) ||
    dialog.contains(form) ||
    form.contains(challenges[0]) ||
    (!daily && !known) ||
    unsafeForm() ||
    nodes(
      '[data-qa="vacancy-response-link-advertising-cancel"],[data-qa="vacancy-response-link-view-topic"],[data-qa="vacancy-response-link-top-again"]'
    ).length;
  if (invalidBoundary()) {
    return null;
  }
  const closes = [...dialog.querySelectorAll('button[type="button"]')].filter(
    (node) => {
      if (
        !visible(node) ||
        node.disabled ||
        node.getAttribute('aria-disabled') === 'true'
      ) {
        return false;
      }
      const qa = node.getAttribute('data-qa') ?? '';
      const label = node.getAttribute('aria-label') ?? '';
      return (
        /^(?:close|закрыть)$/iu.test(label) ||
        /(?:^|-)close(?:-|$)/iu.test(qa) ||
        (!qa &&
          !label &&
          node.childNodes.length === 1 &&
          node.firstChild.nodeType === 1 &&
          node.firstChild.tagName.toLowerCase() === 'svg')
      );
    }
  );
  if (closes.length !== 1) {
    return null;
  }
  const values = applicationValues();
  if (!values) {
    return null;
  }
  function applicationValues() {
    const all = [
      ...doc.querySelectorAll(
        'input,textarea,select,[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="listbox"],[contenteditable="true"]'
      ),
    ];
    if (
      all.length > 2000 ||
      all.some((node) => node.form === form && !form.contains(node)) ||
      form.outerHTML.length > 100000
    ) {
      return null;
    }
    const fields = all.flatMap((node, index) =>
      form.contains(node) && visible(node) ? [{ node, index }] : []
    );
    const native = fields.every(
      ({ node }) =>
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) &&
        !node.hasAttribute('contenteditable') &&
        !node.hasAttribute('role') &&
        (node.tagName !== 'INPUT' ||
          [
            'text',
            'search',
            'email',
            'url',
            'tel',
            'number',
            'date',
            'checkbox',
            'radio',
            'hidden',
            'submit',
            'button',
            'reset',
          ].includes(node.type))
    );
    if (!native) {
      return null;
    }
    return fields
      .filter(
        ({ node }) =>
          !['hidden', 'submit', 'button', 'reset'].includes(node.type)
      )
      .map(({ node, index }) => ({
        index,
        value: node.value,
        checked: Boolean(node.checked),
        disabled: Boolean(node.disabled || node.readOnly),
        selected: node.selectedIndex ?? null,
      }));
  }
  const guard = JSON.stringify([
    current.href,
    documentKey,
    form.outerHTML,
    values,
  ]);
  if (!input.action) {
    return { guard };
  }
  if (input.guard !== guard || target !== closes[0] || !target.isConnected) {
    return null;
  }
  if (input.action === 'candidate') {
    return { candidate: true };
  }
  if (input.action !== 'dismiss') {
    return null;
  }
  target.click();
  return { requested: true };
};
/* eslint-enable max-lines-per-function */
