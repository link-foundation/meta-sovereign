/** Runs in the native page; allowlisted public CV editor fields only. */
export const readCvEditorDocument = () => {
  const { document: doc, location } = globalThis;
  if (doc.readyState === 'loading') {
    return { kind: 'unavailable' };
  }
  const visible = (node) =>
    Boolean(
      node &&
      node.getClientRects().length &&
      !node.closest('[hidden],[inert],[aria-hidden="true"]')
    );
  const unique = (selector) => {
    const nodes = [...doc.querySelectorAll(selector)].filter(visible);
    return nodes.length === 1 ? nodes[0] : null;
  };
  const value = (selector) => unique(selector)?.value ?? '';
  const about = unique('textarea[data-qa="resume-editor-about"]');
  const position = unique('input[name="position"]');
  if (about && position) {
    return { kind: 'unavailable' };
  }
  if (!about && !position) {
    return null;
  }
  const url = new URL(location.href);
  if (about) {
    return {
      kind: 'about',
      url: url.href,
      hash: url.pathname.match(
        /^\/resume\/(?:edit\/)?([a-zA-Z\d_-]+)(?:\/|$)/u
      )?.[1],
      about: about.value,
    };
  }
  return readWorkplace();
  function readWorkplace() {
    const month = (part) =>
      unique(
        `[data-qa="resume-editor-experience-${part}-month-input"] [data-qa="trigger-values-wrapper"]`
      )?.textContent.trim() ?? '';
    const area = unique('[data-qa="resume-editor-experience-area-input"]');
    const industries = [
      ...doc.querySelectorAll('[data-qa="trigger-root"]'),
    ].filter(
      (node) =>
        visible(node) &&
        /field of activity|сфера деятельности/iu.test(node.textContent)
    );
    const industry = industries.length === 1 ? industries[0] : null;
    return {
      kind: 'workplace',
      locale: doc.documentElement.lang,
      url: url.href,
      recordId:
        url.pathname.match(/^\/profile\/edit\/experience\/(\d+)\/?$/u)?.[1] ??
        null,
      company: value('input[name="company"]'),
      position: position.value,
      description: value(
        '[data-qa="resume-editor-experience-description-input"]'
      ),
      start: `${month('start')} ${value('[data-qa="resume-editor-experience-start-year-input"]')}`,
      end: `${month('end')} ${value('[data-qa="resume-editor-experience-end-year-input"]')}`,
      current: Boolean(
        unique('[data-qa="resume-editor-experience-present-checkbox"]')?.checked
      ),
      metadataEditable: Boolean(area),
      area: (
        area?.querySelector('[data-qa="trigger-values-wrapper"]')
          ?.textContent ??
        area?.querySelector('input')?.value ??
        ''
      ).trim(),
      website: value('[data-qa="resume-editor-experience-company-url-input"]'),
      industryText:
        industry
          ?.querySelector('[data-qa="trigger-values-wrapper"]')
          ?.textContent.trim() ?? null,
      resumes: [
        ...doc.querySelectorAll('[data-qa^="profile-resumes-list-checkbox-"]'),
      ]
        .filter(visible)
        .map((node) => ({
          hash: node
            .getAttribute('data-qa')
            .slice('profile-resumes-list-checkbox-'.length),
          checked: Boolean(
            (node.matches('input') ? node : node.querySelector('input'))
              ?.checked
          ),
        })),
    };
  }
};

/** Passive listeners. No event is synthesized, blocked, or treated as a receipt. */
export const observeCvEditorDocument = (read, binding) => {
  const { document: doc } = globalThis;
  const key = `__cv_observer_${binding}`;
  globalThis[key]?.();
  const deliver = (value) => {
    try {
      const bounded =
        JSON.stringify(value).length <= 128 * 1024
          ? value
          : { event: 'overflow' };
      void globalThis[binding](bounded).catch(() => {});
    } catch {
      /* A disappearing document has no capture authority. */
    }
  };
  const click = (event) => {
    if (!event.isTrusted) {
      return;
    }
    const button = event.target?.closest?.(
      '[data-qa="resume-partial-edit-save"],[data-qa="profile-layout-save-button"],[data-qa="resume-partial-edit-cancel"],[data-qa="profile-layout-cancel-button"]'
    );
    if (
      !button ||
      button.disabled ||
      (button.getAttribute('data-qa').startsWith('profile-layout') &&
        button.closest('[role="dialog"]'))
    ) {
      return;
    }
    const form = read();
    if (form) {
      const cancel = /cancel/u.test(button.getAttribute('data-qa'));
      deliver({ event: cancel ? 'cancel' : 'save', form });
    }
  };
  const edited = (event) => {
    if (event.isTrusted && read()) {
      deliver({ event: 'edit' });
    }
  };
  doc.addEventListener('click', click, { capture: true, passive: true });
  for (const name of ['input', 'change']) {
    doc.addEventListener(name, edited, { capture: true, passive: true });
  }
  globalThis[key] = () => {
    doc.removeEventListener('click', click, true);
    for (const name of ['input', 'change']) {
      doc.removeEventListener(name, edited, true);
    }
    delete globalThis[key];
  };
};
