// Native HH entry and delivery markers are separate from generic form review.
export const applicationSelectors = {
  enter: '[data-qa="vacancy-response-link-top"]',
  submit:
    '[data-qa="vacancy-response-submit-popup"], [data-qa="vacancy-response-letter-submit"], [data-qa="vacancy-response-link-no-questions"]',
  letter:
    'textarea[data-qa="vacancy-response-popup-form-letter-input"], textarea[data-qa="vacancy-response-form-letter-input"]',
  letterToggle:
    '[data-qa="vacancy-response-letter-toggle"], [data-qa="add-cover-letter"]',
};

/** One serializable document boundary, also used for synchronous click admission. */
/* eslint-disable max-lines-per-function -- DOM helpers must serialize with their document boundary. */
export const applicationDocument = (target, input) => {
  const { document: doc, location } = globalThis;
  const { url, selectors } = input;
  const visible = (node) => {
    const style = globalThis.getComputedStyle(node);
    return (
      !node.closest('[hidden], [inert], [aria-hidden="true"]') &&
      !['hidden', 'collapse'].includes(style.visibility) &&
      style.display !== 'none' &&
      node.getClientRects().length > 0
    );
  };
  const nodes = (selector) =>
    [...doc.querySelectorAll(selector)].filter(visible);
  const unique = (selector) => {
    const all = nodes(selector);
    return all.length === 1 ? all[0] : null;
  };
  const key = Symbol.for('meta-sovereign.jobs.application-document.v1');
  if (!Object.hasOwn(doc, key)) {
    Object.defineProperty(doc, key, { value: globalThis.crypto.randomUUID() });
  }
  const current = new URL(location.href);
  const expected = new URL(url);
  const sameVacancy = (value) =>
    value.origin === expected.origin &&
    (value.pathname === expected.pathname ||
      (value.pathname === '/applicant/vacancy_response' &&
        value.searchParams.getAll('vacancyId').length === 1 &&
        value.searchParams.get('vacancyId') ===
          expected.pathname.split('/').at(-1)));
  const foreign = nodes('[data-qa="vacancy-credentials"] a[href]').some(
    (node) => {
      const value = new URL(node.href);
      return value.pathname.startsWith('/vacancy/') && !sameVacancy(value);
    }
  );
  const bound =
    sameVacancy(current) && !current.username && !current.password && !foreign;
  const describe = (selector) => {
    const node = unique(selector);
    if (!node) {
      return null;
    }
    const href = node.getAttribute('href');
    const safe =
      !href || href.startsWith('#') || sameVacancy(new URL(href, current));
    return {
      qa: node.getAttribute('data-qa'),
      tag: node.tagName,
      text: node.textContent.trim().slice(0, 500),
      href,
      disabled:
        !safe ||
        Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'),
    };
  };
  const applicationError = (form) => {
    const errors = nodes('[data-qa-popup-error-code]');
    const alerts = nodes('[role="alert"], [data-qa="vacancy-response-error"]')
      .filter(
        (node) =>
          form?.contains(node) ||
          node.matches('[data-qa="vacancy-response-error"]')
      )
      .map((node) => node.textContent.replace(/\s+/gu, ' ').trim())
      .filter(Boolean);
    const generic =
      errors.some(
        (node) => node.getAttribute('data-qa-popup-error-code') === 'unknown'
      ) ||
      alerts.some(
        (text) =>
          text.includes('Произошла ошибка, попробуйте ещё раз') ||
          text.includes('An error occurred, please try again')
      );
    return generic
      ? 'generic-error'
      : errors.length || alerts.length
        ? 'validation-error'
        : null;
  };
  const snapshot = () => {
    const submit = unique(selectors.submit);
    const form = submit?.form ?? submit?.closest('form');
    const controls = [
      ...doc.querySelectorAll(
        'input,textarea,select,[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="listbox"],[contenteditable="true"]'
      ),
    ];
    const fields = controls.slice(0, 2000).flatMap((node, index) =>
      form?.contains(node) && visible(node)
        ? [
            {
              index,
              value: node.value ?? node.textContent,
              checked: Boolean(node.checked),
              disabled: Boolean(node.disabled || node.readOnly),
              selected: node.selectedIndex ?? null,
            },
          ]
        : []
    );
    const letters = nodes(selectors.letter);
    const letter =
      letters.length === 1 && form?.contains(letters[0]) ? letters[0] : null;
    const html = form?.outerHTML ?? '';
    const marked = (selector) => nodes(selector).length > 0;
    return {
      bound,
      url: bound ? current.href : null,
      documentKey: doc[key],
      challenge: marked(
        '[data-qa="captcha"], iframe[src*="captcha"], input[name="captcha"], .smart-captcha, .g-recaptcha, .h-captcha'
      ),
      dailyLimit: marked(
        '[data-qa-popup-error-code="negotiations-limit-exceeded"]'
      ),
      error: applicationError(form),
      external: marked('[data-qa="vacancy-response-link-advertising-cancel"]'),
      delivered: marked(
        '[data-qa="vacancy-response-link-view-topic"], [data-qa="vacancy-response-link-top-again"]'
      ),
      questions: marked('[data-qa="task-body"]'),
      enter: describe(selectors.enter),
      submit: describe(selectors.submit),
      letter: letter
        ? {
            value: letter.value,
            index: controls.indexOf(letter),
            disabled: Boolean(letter.disabled || letter.readOnly),
          }
        : null,
      letterToggle: describe(selectors.letterToggle),
      ambiguousLetter: letters.length > 1,
      scope: Boolean(
        form &&
        fields.length <= 200 &&
        html.length <= 100000 &&
        controls.length <= 2000
      ),
      fieldIndices: fields.map((field) => field.index),
      scopeStructureKey: html.slice(0, 100000),
      scopeKey: JSON.stringify([html.slice(0, 100000), fields]),
    };
  };
  const result = snapshot();
  if (!input.action) {
    return result;
  }
  const admits = () => {
    const allowed =
      bound &&
      !result.challenge &&
      !result.dailyLimit &&
      !result.error &&
      !result.external &&
      !result.delivered;
    if (
      !allowed ||
      JSON.stringify(result) !== input.guard ||
      !target?.isConnected ||
      unique(selectors[input.action]) !== target ||
      !result[input.action] ||
      result[input.action].disabled
    ) {
      return false;
    }
    return true;
  };
  if (!admits()) {
    return { dispatched: false };
  }
  const writeLetter = () => {
    if (target.readOnly) {
      return { dispatched: false };
    }
    if (target.value === input.text) {
      return { letter: 'verified' };
    }
    if (target.value !== '') {
      return { letter: 'owner-conflict' };
    }
    const setter = Object.getOwnPropertyDescriptor(
      globalThis.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    setter.call(target, input.text);
    target.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    target.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    return { letter: target.value === input.text ? 'verified' : 'unverified' };
  };
  if (input.action === 'letter') {
    return writeLetter();
  }
  // Validation and dispatch share a synchronous turn. A replaced target is never retried.
  target.click();
  return { dispatched: true };
};

/* eslint-enable max-lines-per-function */

export const readApplicationPage = (browser, url) =>
  browser.commander.evaluate({
    fn: applicationDocument,
    args: [null, { url, selectors: applicationSelectors }],
  });

/** Bind one exact visible element; dispose every other candidate. */
export const applicationTarget = async (page, selector) => {
  const handles = await page.$$(selector);
  let chosen;
  let ambiguous = false;
  try {
    for (const handle of handles) {
      const visible = await handle.evaluate((node) => {
        const style = globalThis.getComputedStyle(node);
        return (
          node.getClientRects().length > 0 &&
          !node.closest('[hidden], [inert], [aria-hidden="true"]') &&
          !['hidden', 'collapse'].includes(style.visibility) &&
          style.display !== 'none'
        );
      });
      if (visible) {
        if (chosen) {
          ambiguous = true;
          return null;
        }
        chosen = handle;
      }
    }
    return chosen;
  } finally {
    for (const handle of handles) {
      if (ambiguous || handle !== chosen) {
        await handle.dispose();
      }
    }
  }
};

export const dispatchApplication = (handle, record, action) =>
  handle.evaluate(applicationDocument, {
    url: record.url,
    selectors: applicationSelectors,
    action,
    guard: record.guard.page,
  });

/** The letter uses the same synchronous vacancy/document/form admission. */
export const writeApplicationLetter = async (browser, text, page, url) => {
  const handle = await applicationTarget(
    browser.page,
    applicationSelectors.letter
  );
  if (!handle) {
    return 'unavailable';
  }
  try {
    const result = await handle.evaluate(applicationDocument, {
      url,
      selectors: applicationSelectors,
      action: 'letter',
      guard: JSON.stringify(page),
      text,
    });
    return result.letter ?? 'unavailable';
  } finally {
    await handle.dispose();
  }
};
