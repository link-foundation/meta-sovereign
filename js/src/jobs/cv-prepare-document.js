/** Page-side readiness and baseline only; no account fields or DOM text writes. */
export const readCvAboutPreparation = () => {
  const { document: doc, location } = globalThis;
  const visible = (node) =>
    Boolean(
      node.getClientRects().length &&
      !node.closest('[hidden],[inert],[aria-hidden="true"]')
    );
  const fields = [
    ...doc.querySelectorAll('textarea[data-qa="resume-editor-about"]'),
  ].filter(visible);
  const other = [
    ...doc.querySelectorAll(
      'input[name="position"], [data-qa="resume-partial-edit-save"], [data-qa="profile-layout-save-button"], [data-qa^="resume-editor-"]:is(input,textarea), [contenteditable="true"]'
    ),
  ].filter(visible);
  const props = (node) =>
    node?.[Object.keys(node).find((key) => key.startsWith('__reactProps$'))];
  const buttons = [
    ...doc.querySelectorAll('[data-qa="resume-edit-button-about"]'),
  ].filter(visible);
  const button = buttons.length === 1 ? buttons[0] : null;
  const field = fields.length === 1 ? fields[0] : null;
  return {
    hash:
      location.pathname.match(
        /^\/resume\/(?:edit\/)?([a-zA-Z\d_-]+)(?:\/about)?\/?$/u
      )?.[1] ?? null,
    ready: doc.readyState !== 'loading',
    challenge: Boolean(
      doc.querySelector(
        'input[name*="captcha"], [data-qa="account-login-form"]'
      )
    ),
    open: fields.length > 0 || other.length > 0,
    aboutCount: fields.length,
    foreign: other.some(
      (node) =>
        !node.matches(
          'textarea[data-qa="resume-editor-about"], [data-qa="resume-partial-edit-save"]'
        )
    ),
    openerReady: Boolean(
      button &&
      !button.disabled &&
      (typeof props(button)?.onClick === 'function' ||
        typeof button.onclick === 'function')
    ),
    ...fieldState(field),
  };
  function fieldState(node) {
    const controlled = props(node);
    return {
      about: node?.value ?? null,
      controlled: typeof controlled?.onChange === 'function',
      controlledValue:
        typeof controlled?.value === 'string' ? controlled.value : null,
      writable: Boolean(node && !node.disabled && !node.readOnly),
      maxLength: node?.maxLength ?? -1,
    };
  }
};
