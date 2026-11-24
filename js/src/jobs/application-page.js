// Native HH entry and delivery markers are separate from generic form review.
export const applicationSelectors = {
  enter: '[data-qa="vacancy-response-link-top"]',
  submit:
    '[data-qa="vacancy-response-submit-popup"], [data-qa="vacancy-response-letter-submit"], [data-qa="vacancy-response-link-no-questions"]',
  letter:
    'textarea[data-qa="vacancy-response-popup-form-letter-input"], textarea[data-qa="vacancy-response-form-letter-input"]',
  letterToggle:
    '[data-qa="vacancy-response-letter-toggle"], [data-qa="add-cover-letter"]',
  attachmentOpen: '[data-qa="responded-success-attach-cover-letter"]',
  attachmentWrite:
    'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
  attachmentSend: 'button[data-qa="vacancy-response-letter-submit"]',
  resumeMenu:
    '[data-qa="resume-title"]:not([role="option"] [data-qa="resume-title"])',
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
  const challengePresent = () =>
    nodes(
      '[data-qa="captcha"], iframe[src*="captcha"], input[name="captcha"], input[data-qa="account-captcha-input"], input[name="captchaText"], .smart-captcha, .g-recaptcha, .h-captcha'
    ).length > 0;
  const searchDestination = () => {
    if (typeof input.searchUrl !== 'string') {
      return null;
    }
    const value = new URL(input.searchUrl);
    return value.origin === expected.origin &&
      value.pathname === '/search/vacancy' &&
      !value.username &&
      !value.password &&
      !value.hash
      ? value
      : null;
  };
  const searchState = () => {
    const destination = searchDestination();
    if (!destination || current.pathname !== '/search/vacancy') {
      return {};
    }
    const actual = new URL(current);
    actual.searchParams.sort();
    destination.searchParams.sort();
    const links = nodes('a[data-qa="serp-item__title"]');
    const empty = nodes(
      '[data-qa="vacancy-serp__vacancy-not-found"], [data-qa="vacancy-serp__no-results"]'
    );
    const controls = [
      ...doc.querySelectorAll('input,textarea,select,[contenteditable="true"]'),
    ];
    // A search page may contain its own search fields, never an application draft.
    const draft = controls.some(
      (node) =>
        (node.matches('textarea,[contenteditable="true"]') &&
          Boolean((node.value ?? node.textContent).trim())) ||
        (node.matches('input[type="file"]') && node.files.length > 0)
    );
    const text = doc.body?.innerText ?? '';
    const fields = [];
    let bounded = controls.length <= 2000 && text.length <= 200000;
    let fieldSize = text.length;
    if (bounded && !draft) {
      for (const node of controls) {
        const html = node.outerHTML;
        const value = String(node.value ?? node.textContent);
        fieldSize += html.length + value.length;
        if (html.length > 8000 || value.length > 24000 || fieldSize > 500000) {
          bounded = false;
          break;
        }
        fields.push([
          html,
          value,
          Boolean(node.checked),
          node.selectedIndex ?? null,
        ]);
      }
    }
    const searchKey =
      bounded && !draft
        ? JSON.stringify([
            text,
            fields,
            links.slice(0, 100).map((node) => node.href),
          ])
        : '';
    return {
      searchBound: actual.href === destination.href,
      searchReady:
        bounded &&
        searchKey.length <= 1000000 &&
        !draft &&
        (links.length > 0 || empty.length === 1) &&
        links.length <= 100 &&
        links.every((node) => {
          const value = new URL(node.href);
          return (
            value.origin === expected.origin &&
            /^\/vacancy\/\d+$/u.test(value.pathname) &&
            !value.username &&
            !value.password
          );
        }),
      searchKey: searchKey.length <= 1000000 ? searchKey : '',
    };
  };
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
        node.matches(':disabled') ||
        node.getAttribute('aria-disabled') === 'true',
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
  const resumeTitle = (node) => {
    const text = node?.textContent.trim() ?? '';
    return text.length <= 500 ? text : '';
  };
  const unsafeResumeButton = (node) => {
    const button = node.closest('button');
    return Boolean(
      button?.disabled ||
      (button && button.type !== 'button') ||
      node.closest('a[href], [aria-disabled="true"]')
    );
  };
  const resumeOption = (node) => {
    const radios = node.querySelectorAll('input[type="radio"]');
    return {
      hash:
        radios.length === 1 &&
        node.getAttribute('data-qa') ===
          `magritte-select-option-${radios[0].value}`
          ? radios[0].value
          : '',
      title: resumeTitle(node.querySelector('[data-qa="resume-title"]')),
      checked: radios.length === 1 && radios[0].checked,
      disabled: Boolean(radios[0]?.disabled || unsafeResumeButton(node)),
    };
  };
  const ambiguousResumes = (rows) =>
    rows.length > 100 ||
    rows.some(
      (row) => !/^[a-zA-Z0-9_-]{1,100}$/u.test(row.hash) || !row.title
    ) ||
    new Set(rows.map((row) => row.hash)).size !== rows.length ||
    rows.filter((row) => row.checked).length > 1;
  const resumeChooser = (form) => {
    const titles = nodes(selectors.resumeMenu).filter((node) =>
      form?.contains(node)
    );
    if (!titles.length) {
      return null;
    }
    const lists = nodes('[data-qa="magritte-select-option-list"]');
    const options =
      lists.length === 1
        ? [
            ...lists[0].querySelectorAll(
              '[role="option"][data-qa^="magritte-select-option-"]'
            ),
          ].filter(visible)
        : [];
    const rows = options.slice(0, 101).map(resumeOption);
    const title = resumeTitle(titles[0]);
    return {
      title,
      open: lists.length > 0,
      disabled: unsafeResumeButton(titles[0]),
      ambiguous:
        !title ||
        titles.length !== 1 ||
        lists.length > 1 ||
        ambiguousResumes(rows),
      options: rows,
    };
  };
  const marked = (selector) => nodes(selector).length > 0;
  const attachmentOffer = () => {
    if (marked(selectors.attachmentWrite) || marked(selectors.attachmentSend)) {
      return null;
    }
    const offer = unique(selectors.attachmentOpen);
    return offer?.matches('button[type="button"], a[href^="#"]') ||
      (offer?.matches('button:not([type])') && !offer.form)
      ? describe(selectors.attachmentOpen)
      : null;
  };
  const attachmentSnapshot = () => {
    const submit = unique(selectors.attachmentSend);
    const letter = unique(selectors.attachmentWrite);
    const popup = letter?.form?.contains(submit)
      ? letter.form
      : letter?.closest('[role="dialog"], [data-qa="modal-overlay"]');
    const action =
      submit?.getAttribute('formaction') ??
      submit?.form?.getAttribute('action');
    const destination = action ? new URL(action, current) : current;
    const otherFields = popup?.querySelectorAll(
      'input:not([type="hidden"]), textarea, select, [contenteditable="true"]'
    );
    const structure = popup?.outerHTML ?? '';
    const isolated =
      popup?.contains(submit) &&
      (!submit.form || submit.form === letter.form) &&
      structure.length <= 100000 &&
      otherFields.length <= 200 &&
      [...otherFields].filter(visible).every((control) => control === letter) &&
      destination.origin === expected.origin &&
      !destination.username &&
      !destination.password;
    const writable =
      isolated &&
      !letter.matches(':disabled') &&
      !letter.readOnly &&
      letter.value.length <= 24000;
    return {
      offer: attachmentOffer(),
      submit: writable ? describe(selectors.attachmentSend) : null,
      value: writable ? letter.value : null,
      maxLength: writable && letter.maxLength >= 0 ? letter.maxLength : null,
      structure: isolated ? structure : '',
      error: popup ? applicationError(popup) : null,
      pending: Boolean(
        doc.querySelector(
          [
            selectors.attachmentOpen,
            selectors.attachmentWrite,
            selectors.attachmentSend,
          ].join(',')
        )
      ),
    };
  };
  const renderedWarning = (scope, matches) => {
    if (!scope) {
      return false;
    }
    const rendered = (element) => {
      for (let depth = 0; element && depth < 64; depth += 1) {
        const style = globalThis.getComputedStyle(element);
        if (
          !visible(element) ||
          (element.getBoundingClientRect().height === 0 &&
            [style.overflow, style.overflowY].some(
              (value) => value !== 'visible'
            ))
        ) {
          return false;
        }
        if (element === scope) {
          return true;
        }
        element = element.parentElement;
      }
      return false;
    };
    const walker = doc.createTreeWalker(scope, globalThis.NodeFilter.SHOW_TEXT);
    for (let count = 0; count < 8000; count += 1) {
      const node = walker.nextNode();
      if (!node) {
        break;
      }
      const parent = node.parentElement;
      const text = node.textContent
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/\s+/gu, ' ')
        .trim();
      if (
        text &&
        !parent.closest('script,style,template') &&
        rendered(parent) &&
        matches(parent, text)
      ) {
        return true;
      }
    }
    return false;
  };
  const resumeNotVisible = (scope) =>
    renderedWarning(
      scope,
      (parent, text) =>
        parent.closest('[data-qa="hidden-resume-warning"]') ||
        [
          'поменяйте видимость резюме',
          'change the visibility of your resume',
          'change your resume visibility',
          'change resume visibility',
        ].some((phrase) => text.includes(phrase))
    );
  const vacancyUnavailable = () => {
    if (!bound || current.pathname !== expected.pathname) {
      return false;
    }
    let text = '';
    return renderedWarning(doc.body, (parent, fragment) => {
      if (
        parent.closest(
          'form,input,textarea,select,[contenteditable],[data-qa="vacancy-description"],[data-qa="task-body"]'
        )
      ) {
        text = '';
        return false;
      }
      const joined = `${text} ${fragment}`;
      text = joined.slice(-250);
      return /вам недоступна эта вакансия|(?:this )?vacancy is (?:not available|unavailable) (?:to|for) you/iu.test(
        joined
      );
    });
  };
  const visibilityScope = (form) =>
    form ??
    (current.pathname === '/applicant/vacancy_response' ? doc.body : null);
  const externalDestination = () => {
    if (!bound) {
      return null;
    }
    const alert = unique(
      '[data-qa="vacancy-response-link-advertising-cancel"]'
    )?.closest('[data-qa="magritte-alert"]');
    const links = alert?.querySelectorAll('a[href]') ?? [];
    if (links.length > 100) {
      return null;
    }
    const destinations = [...links].filter(visible).flatMap((node) => {
      try {
        const value = new URL(node.href, current);
        value.hash = '';
        return ['http:', 'https:'].includes(value.protocol) &&
          !value.username &&
          !value.password &&
          value.href.length <= 4000 &&
          !/(^|\.)hh\.ru$/u.test(value.hostname)
          ? [value.href]
          : [];
      } catch {
        return [];
      }
    });
    return new Set(destinations).size === 1 ? destinations[0] : null;
  };
  const formSnapshot = (delivered) => {
    const submit = delivered ? null : unique(selectors.submit);
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
    return {
      externalUrl: externalDestination(),
      resumeNotVisible: resumeNotVisible(visibilityScope(form)),
      vacancyUnavailable: vacancyUnavailable(),
      error: applicationError(form),
      enter: describe(selectors.enter),
      submit: delivered ? null : describe(selectors.submit),
      letter: letter
        ? {
            value: letter.value,
            index: controls.indexOf(letter),
            disabled: Boolean(letter.disabled || letter.readOnly),
          }
        : null,
      letterToggle: describe(selectors.letterToggle),
      resumeChooser: resumeChooser(form),
      ambiguousLetter: letters.length > 1,
      scope: Boolean(
        form &&
        fields.length <= 200 &&
        html.length <= 100000 &&
        controls.length <= 2000
      ),
      fieldIndices: fields.map((field) => field.index),
      questionIndices: fields
        .filter(
          (field) =>
            controls[field.index] !== letter &&
            controls[field.index].closest('[data-qa="task-body"]') &&
            !controls[field.index].closest(
              '[data-qa="magritte-select-option-list"]'
            )
        )
        .map((field) => field.index),
      resumeIndices: fields
        .filter(
          (field) =>
            controls[field.index].matches('input[type="radio"]') &&
            controls[field.index].closest(
              '[data-qa="magritte-select-option-list"] [role="option"]'
            )
        )
        .map((field) => field.index),
      scopeStructureKey: html.slice(0, 100000),
      scopeKey: JSON.stringify([html.slice(0, 100000), fields]),
    };
  };
  const snapshot = () => {
    // Detect the boundary before any form value, instructions or HTML read.
    const challenge = challengePresent();
    if (input.verificationOnly) {
      return { bound, documentKey: doc[key], challenge };
    }
    const metadata = {
      bound,
      url: bound ? current.href : null,
      documentKey: doc[key],
      challenge,
      dailyLimit: marked(
        '[data-qa-popup-error-code="negotiations-limit-exceeded"]'
      ),
      external: marked('[data-qa="vacancy-response-link-advertising-cancel"]'),
      delivered: marked(
        '[data-qa="vacancy-response-link-view-topic"], [data-qa="vacancy-response-link-top-again"]'
      ),
      questions: marked('[data-qa="task-body"]'),
    };
    const content = metadata.challenge
      ? {
          externalUrl: null,
          resumeNotVisible: false,
          vacancyUnavailable: false,
          error: null,
          enter: null,
          submit: null,
          letter: null,
          letterToggle: null,
          resumeChooser: null,
          ambiguousLetter: false,
          scope: false,
          fieldIndices: [],
          questionIndices: [],
          resumeIndices: [],
          scopeStructureKey: '',
          scopeKey: JSON.stringify(['', []]),
        }
      : formSnapshot(metadata.delivered);
    return {
      ...metadata,
      ...content,
      ...(bound &&
      metadata.delivered &&
      !metadata.challenge &&
      !metadata.dailyLimit &&
      !metadata.external &&
      !metadata.questions &&
      current.pathname === expected.pathname
        ? { attachment: attachmentSnapshot() }
        : {}),
      ...(metadata.challenge ? {} : searchState()),
    };
  };
  const result = snapshot();
  if (!input.action) {
    return result;
  }
  const navigateFullForm = () => {
    const destination = new URL('/applicant/vacancy_response', expected);
    destination.searchParams.set(
      'vacancyId',
      expected.pathname.split('/').at(-1)
    );
    destination.searchParams.set('startedWithQuestion', 'false');
    globalThis.location.assign(destination.href);
    return { navigated: true };
  };
  if (input.action === 'searchForm') {
    return result.searchBound &&
      result.searchReady &&
      !bound &&
      !result.challenge &&
      !result.dailyLimit &&
      !result.error &&
      !result.external &&
      !result.delivered &&
      !result.questions &&
      !result.scope &&
      !result.submit &&
      JSON.stringify(result) === input.guard
      ? navigateFullForm()
      : { navigated: false };
  }
  const refreshLimitedForm = () =>
    bound &&
    result.dailyLimit &&
    result.scope &&
    !result.challenge &&
    !result.external &&
    !result.resumeNotVisible &&
    !result.vacancyUnavailable &&
    !result.delivered &&
    JSON.stringify(result) === input.guard &&
    target?.isConnected &&
    unique(selectors.submit) === target
      ? navigateFullForm()
      : { navigated: false };
  if (input.action === 'limitRefresh') {
    return refreshLimitedForm();
  }
  const resumeAction = () => {
    const chooser = result.resumeChooser;
    if (!chooser || chooser.ambiguous || chooser.disabled) {
      return null;
    }
    return input.action === 'resumeMenu'
      ? chooser
      : chooser.options.find(
          (row) => row.hash === input.resume && !row.disabled
        );
  };
  const admits = () => {
    const allowed =
      bound &&
      !result.challenge &&
      !result.dailyLimit &&
      !result.error &&
      ![
        result.external,
        result.resumeNotVisible,
        result.vacancyUnavailable,
      ].some(Boolean) &&
      !result.delivered;
    const nativeAction = ['fullForm', 'search'].includes(input.action)
      ? 'enter'
      : input.action;
    const action = ['resumeMenu', 'resumeChoice'].includes(input.action)
      ? resumeAction()
      : result[nativeAction];
    if (
      !allowed ||
      JSON.stringify(result) !== input.guard ||
      !target?.isConnected ||
      unique(selectors[nativeAction]) !== target ||
      !action ||
      action.disabled
    ) {
      return false;
    }
    return true;
  };
  const writeLetter = () => {
    if (target.readOnly) {
      return { dispatched: false };
    }
    if (target.value === input.text) {
      return { letter: 'verified' };
    }
    if (target.value !== '' && target.value !== input.previousText) {
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
  const dispatchAttachment = () => {
    const attachment = result.attachment;
    const opening = input.action === 'attachmentOpen';
    const sending = input.action === 'attachmentSend';
    const control = opening ? attachment?.offer : attachment?.submit;
    if (
      !control ||
      ((opening || sending) && control.disabled) ||
      attachment.error ||
      result.error ||
      result.resumeNotVisible ||
      result.vacancyUnavailable ||
      JSON.stringify(result) !== input.guard ||
      !target?.isConnected ||
      unique(selectors[input.action]) !== target ||
      (sending && (!input.text || attachment.value !== input.text)) ||
      (!opening &&
        attachment.maxLength !== null &&
        input.text?.length > attachment.maxLength)
    ) {
      return { dispatched: false };
    }
    if (input.action === 'attachmentWrite') {
      return writeLetter();
    }
    target.click();
    return { dispatched: true };
  };
  if (
    ['attachmentOpen', 'attachmentWrite', 'attachmentSend'].includes(
      input.action
    )
  ) {
    return dispatchAttachment();
  }
  if (!admits()) {
    return { dispatched: false };
  }
  if (input.action === 'search') {
    const destination = searchDestination();
    if (!destination || result.scope || result.submit || result.questions) {
      return { navigated: false };
    }
    globalThis.location.assign(destination.href);
    return { navigated: true };
  }
  if (input.action === 'fullForm') {
    return navigateFullForm();
  }
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

export const readApplicationVerification = (browser, url) =>
  browser.commander.evaluate({
    fn: applicationDocument,
    args: [null, { url, verificationOnly: true }],
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

export const dispatchApplication = (handle, record, action, text) =>
  handle.evaluate(applicationDocument, {
    url: record.url,
    selectors: applicationSelectors,
    action,
    guard: record.guard.page,
    ...(action === 'attachmentSend' ? { text } : {}),
    ...(action === 'search'
      ? {
          searchUrl:
            record.options.applicationSearchUrl ??
            'https://hh.ru/search/vacancy',
        }
      : {}),
  });

/** The intermediate search has its own document snapshot, without vacancy authority. */
export const applicationSearchPage = (browser, record, guard) =>
  browser.commander.evaluate({
    fn: applicationDocument,
    args: [
      null,
      {
        url: record.url,
        selectors: applicationSelectors,
        searchUrl:
          record.options.applicationSearchUrl ?? 'https://hh.ru/search/vacancy',
        ...(guard === undefined ? {} : { action: 'searchForm', guard }),
      },
    ],
  });

/** The letter uses the same synchronous vacancy/document/form admission. */
export const writeApplicationLetter = async (
  browser,
  text,
  page,
  url,
  previousText,
  action = 'letter'
) => {
  const handle = await applicationTarget(
    browser.page,
    applicationSelectors[action]
  );
  if (!handle) {
    return 'unavailable';
  }
  try {
    const result = await handle.evaluate(applicationDocument, {
      url,
      selectors: applicationSelectors,
      action,
      guard: JSON.stringify(page),
      text,
      previousText,
    });
    return result.letter ?? 'unavailable';
  } finally {
    await handle.dispose();
  }
};
