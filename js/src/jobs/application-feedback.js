/** Serializable, narrowly scoped HH survey policy; never reads question values. */
export const applicationFeedbackDocument = ({ url, stop = false }) => {
  const doc = globalThis.document;
  const key = Symbol.for('meta-sovereign.jobs.vacancy-feedback.v1');
  doc[key]?.();
  delete doc[key];
  if (stop) {
    return;
  }
  const expected = new URL(url);
  const visible = (node) => {
    const style = globalThis.getComputedStyle(node);
    return (
      node.isConnected &&
      !node.closest('[hidden],[inert],[aria-hidden="true"]') &&
      style.display !== 'none' &&
      !['hidden', 'collapse'].includes(style.visibility) &&
      node.getClientRects().length > 0
    );
  };
  const nodes = (selector, scope = doc) =>
    [...scope.querySelectorAll(selector)].filter(visible);
  const admitted = () => {
    const current = new URL(globalThis.location.href);
    return (
      globalThis.top === globalThis.self &&
      current.origin === expected.origin &&
      !current.username &&
      !current.password &&
      (current.pathname === expected.pathname ||
        (current.pathname === '/applicant/vacancy_response' &&
          current.searchParams.getAll('vacancyId').length === 1 &&
          current.searchParams.get('vacancyId') ===
            expected.pathname.split('/').at(-1))) &&
      !nodes(
        'input[data-qa="account-captcha-input"],input[name="captchaText"],input[name*="captcha"],iframe,[data-qa="captcha"],.smart-captcha,[data-smartcaptcha],.g-recaptcha,.h-captcha,.cf-turnstile,[data-qa="account-login-form"],[data-qa-popup-error-code="negotiations-limit-exceeded"]'
      ).length
    );
  };
  const attempted = new WeakSet();
  let active = true;
  let queued = false;
  const safeClose = (close, dialog) =>
    Boolean(dialog && close) &&
    visible(dialog) &&
    visible(close) &&
    dialog.contains(close) &&
    close.tagName === 'BUTTON' &&
    close.type === 'button' &&
    !close.disabled &&
    close.getAttribute('aria-disabled') !== 'true' &&
    close.getAttribute('data-qa') === 'vacancy-feedback__close';
  const answer = () => {
    queued = false;
    if (!active || !admitted()) {
      return;
    }
    const closes = nodes('[data-qa="vacancy-feedback__close"]');
    const close = closes.length === 1 ? closes[0] : null;
    const dialog = close?.closest('[role="dialog"],[data-qa="modal-overlay"]');
    if (!safeClose(close, dialog) || attempted.has(dialog)) {
      return;
    }
    const options = nodes(
      'input[type="radio"][name="reason"][data-qa="vacancy-feedback__reason-MAYBE_LATER"]',
      dialog
    );
    const option = options.length === 1 ? options[0] : null;
    const ownerChoice = () =>
      [...doc.querySelectorAll('input[name="reason"]')].some(
        (node) =>
          node !== option &&
          node.checked &&
          (dialog.contains(node) || node.form === option?.form)
      );
    if (!option || option.disabled || ownerChoice()) {
      return;
    }
    // Reserve before synchronous native handlers can remount or mutate the dialog.
    attempted.add(dialog);
    if (!option.checked) {
      option.click();
    }
    const canDismiss = () =>
      active &&
      admitted() &&
      safeClose(close, dialog) &&
      dialog.contains(option) &&
      option.checked &&
      !ownerChoice();
    if (canDismiss()) {
      close.click();
    }
  };
  const schedule = () => {
    if (active && !queued) {
      queued = true;
      globalThis.queueMicrotask(answer);
    }
  };
  const observer = new globalThis.MutationObserver(schedule);
  const start = () => {
    if (active && doc.documentElement) {
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'data-qa',
          'data-qa-popup-error-code',
          'name',
          'type',
          'aria-disabled',
          'hidden',
          'inert',
          'aria-hidden',
          'class',
          'style',
          'disabled',
        ],
      });
      schedule();
    }
  };
  doc[key] = () => {
    active = false;
    observer.disconnect();
    doc.removeEventListener('DOMContentLoaded', start);
    doc.removeEventListener('change', schedule, true);
  };
  doc.addEventListener('change', schedule, true);
  if (doc.documentElement) {
    start();
  } else {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
  }
};

/** Attach only to an explicitly opened owned browser, before its first navigation. */
export const watchApplicationFeedback = async (browser, options) => {
  if (
    options.testMode ||
    options.autoAnswerViewedVacancy === false ||
    !browser.page?.addInitScript
  ) {
    return;
  }
  const input = { url: options.url };
  await browser.page.addInitScript(applicationFeedbackDocument, input);
  await browser.page.evaluate(applicationFeedbackDocument, input);
  return async () => {
    if (!browser.page.isClosed()) {
      await browser.page.evaluate(applicationFeedbackDocument, {
        ...input,
        stop: true,
      });
    }
  };
};
