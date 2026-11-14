/** Allowlisted existing workplace controls; passed into page readers explicitly. */
export const cvWorkplaceSelectors = {
  company: 'input[name="company"]',
  position: 'input[name="position"]',
  description: 'textarea[data-qa="resume-editor-experience-description-input"]',
  website: 'input[data-qa="resume-editor-experience-company-url-input"]',
  startYear: 'input[data-qa="resume-editor-experience-start-year-input"]',
  endYear: 'input[data-qa="resume-editor-experience-end-year-input"]',
  current:
    'input[type="checkbox"][data-qa="resume-editor-experience-present-checkbox"]',
};

/** Raw controlled values remain comparable during a partially entered date. */
export const readCvWorkplaceControls = (selectors) => {
  const doc = globalThis.document;
  const visible = (node) =>
    node.getClientRects().length &&
    !node.closest('[hidden],[inert],[aria-hidden="true"]');
  const fields = {};
  const controls = {};
  const readControl = (key, selector) => {
    const nodes = [...doc.querySelectorAll(selector)].filter(visible);
    const node = nodes.length === 1 ? nodes[0] : null;
    const props =
      node?.[Object.keys(node).find((key) => key.startsWith('__reactProps$'))];

    return {
      field: node ? (key === 'current' ? node.checked : node.value) : null,
      count: nodes.length,
      writable: Boolean(node && !node.disabled && !node.readOnly),
      controlled: Boolean(
        typeof props?.onChange === 'function' &&
        (key === 'current'
          ? props.checked === node.checked
          : typeof props.value === 'string')
      ),
      value: key === 'current' ? props?.checked : props?.value,
      maxLength: node?.maxLength ?? -1,
    };
  };
  for (const [key, selector] of Object.entries(selectors)) {
    const { field, ...control } = readControl(key, selector);
    fields[key] = field;
    controls[key] = control;
  }
  const oneText = (selector) => {
    const nodes = [...doc.querySelectorAll(selector)].filter(visible);
    return nodes.length === 1 ? nodes[0].textContent.trim() : null;
  };
  for (const part of ['start', 'end']) {
    fields[`${part}Month`] = oneText(
      `[data-qa="resume-editor-experience-${part}-month-input"] [data-qa="trigger-values-wrapper"]`
    );
  }
  fields.area = oneText(
    '[data-qa="resume-editor-experience-area-input"] [data-qa="trigger-values-wrapper"]'
  );
  const industryTriggers = [
    ...doc.querySelectorAll('[data-qa="trigger-root"]'),
  ].filter(
    (node) =>
      visible(node) &&
      /field of activity|сфера деятельности/iu.test(node.textContent)
  );
  fields.industryText =
    industryTriggers.length === 1
      ? (industryTriggers[0]
          .querySelector('[data-qa="trigger-values-wrapper"]')
          ?.textContent.trim() ?? null)
      : null;
  fields.resumes = [
    ...doc.querySelectorAll('[data-qa^="profile-resumes-list-checkbox-"]'),
  ]
    .filter(visible)
    .map((node) => ({
      hash: node
        .getAttribute('data-qa')
        .slice('profile-resumes-list-checkbox-'.length),
      checked:
        (node.matches('input')
          ? node
          : node.querySelector('input[type="checkbox"]')
        )?.checked ?? null,
    }));
  return {
    fields,
    controls,
    ready: doc.readyState !== 'loading',
    foreign: Boolean(
      doc.querySelector(
        'textarea[data-qa="resume-editor-about"],input[name*="captcha"],[data-qa="account-login-form"]'
      )
    ),
    dialogs: [...doc.querySelectorAll('[role="dialog"]')].filter(visible)
      .length,
    industryDialogs: [...doc.querySelectorAll('[role="dialog"]')].filter(
      (node) =>
        visible(node) &&
        node.querySelector('[data-qa="tree-selector-search-input"]')
    ).length,
  };
};
