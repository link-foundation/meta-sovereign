/** Fixture-only diagnostics never retain entered text or keyboard keys. */
export const installResumeInputTrace = async (
  page,
  enabled = process.env.CI_RESUME_INPUT_DEBUG === '1'
) => {
  if (!enabled) {
    return;
  }
  await page.addInitScript(() => {
    const events = [];
    const key = Symbol.for('meta-sovereign.test.resume-input.v1');
    globalThis[key] = events;
    for (const type of [
      'focusin',
      'focusout',
      'beforeinput',
      'input',
      'change',
    ]) {
      document.addEventListener(
        type,
        (event) => {
          if (events.length >= 32) {
            return;
          }
          events.push({
            type,
            tag: event.target?.tagName,
            field: event.target?.getAttribute?.('data-vacancy-field'),
            invalidHash: event.target?.value === 'invalid/hash',
            focused: document.activeElement === event.target,
            trusted: event.isTrusted,
          });
        },
        true
      );
    }
  });
};

export const readResumeInputTrace = () => {
  const field = document.querySelector('[data-vacancy-field="resume"]');
  const active = document.activeElement;
  return {
    events: globalThis[Symbol.for('meta-sovereign.test.resume-input.v1')] ?? [],
    exists: Boolean(field),
    inputType: field?.type,
    invalidHash: field?.value === 'invalid/hash',
    renderedInvalidHash: field?.defaultValue === 'invalid/hash',
    defaultMatchesValue: field?.defaultValue === field?.value,
    valueLength: field?.value.length,
    focused: active === field,
    activeTag: active?.tagName,
    activeField: active?.getAttribute('data-vacancy-field'),
    searchDisabled: document.querySelector('[data-vacancy-action="search"]')
      ?.disabled,
    inventoryDisabled: document.querySelector('[data-vacancy-action="resumes"]')
      ?.disabled,
    visibility: document.visibilityState,
    readyState: document.readyState,
  };
};

export const traceResumeInput = async (page, phase, force = false) => {
  if (force || process.env.CI_RESUME_INPUT_DEBUG === '1') {
    console.error(
      '[resume-input]',
      JSON.stringify({ phase, ...(await page.evaluate(readResumeInputTrace)) })
    );
  }
};
