const requestTraces = new WeakMap();

/** Fixture-only diagnostics never retain entered text or keyboard keys. */
export const installResumeInputTrace = async (
  page,
  enabled = process.env.CI_RESUME_INPUT_DEBUG === '1'
) => {
  if (!enabled) {
    return;
  }
  const requests = [];
  requestTraces.set(page, requests);
  const record = (request, phase, status) => {
    const path = new URL(request.url()).pathname;
    if (
      !['/api/vacancies/resumes', '/api/vacancies/resumes-stored'].includes(
        path
      )
    ) {
      return;
    }
    requests.push({ path, phase, status });
    if (requests.length > 32) {
      requests.shift();
    }
  };
  page.on('request', (request) => record(request, 'requested'));
  page.on('response', (response) =>
    record(response.request(), 'responded', response.status())
  );
  page.on('requestfailed', (request) => record(request, 'failed'));
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
      'pointerdown',
      'pointerup',
      'click',
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
            action: event.target?.getAttribute?.('data-vacancy-action'),
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
    resumeRows: document.querySelectorAll('[data-vacancy-resume]').length,
    error: document
      .querySelector('[data-vacancy-error]')
      ?.textContent?.slice(0, 160),
    visibility: document.visibilityState,
    readyState: document.readyState,
  };
};

export const traceResumeInput = async (page, phase, force = false) => {
  if (force || process.env.CI_RESUME_INPUT_DEBUG === '1') {
    console.error(
      '[resume-input]',
      JSON.stringify({
        phase,
        ...(await page.evaluate(readResumeInputTrace)),
        requests: requestTraces.get(page) ?? [],
      })
    );
  }
};
