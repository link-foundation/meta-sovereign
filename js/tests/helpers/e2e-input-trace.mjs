// Bounded diagnostics for hosted input failures. Record control identity and
// value lengths, never input contents; the application diagnostics stay opt-in.
export const traceBrowserInputs = async (page, selector) => {
  await page.addInitScript((controls) => {
    globalThis.metaSovereignDebug = true;
    globalThis.browserInputTrace = [];
    const record = (event) => {
      const target = event.target?.closest?.(controls);
      if (!target) {
        return;
      }
      const trace = globalThis.browserInputTrace;
      trace.push({
        type: event.type,
        tag: target.tagName,
        control: [...target.attributes]
          .filter((attribute) => attribute.name.startsWith('data-'))
          .map((attribute) => [attribute.name, attribute.value]),
        length: typeof target.value === 'string' ? target.value.length : null,
        disabled: target.matches(':disabled'),
        trusted: event.isTrusted,
        view: document.querySelector('main[data-view]')?.dataset.view,
      });
      if (trace.length > 60) {
        trace.shift();
      }
    };
    for (const type of [
      'pointerdown',
      'click',
      'beforeinput',
      'input',
      'change',
    ]) {
      globalThis.addEventListener(type, record, true);
    }
  }, selector);
  page.on('console', (message) => {
    if (/^\[ms-debug\] (?:model-|question-|navigation-)/.test(message.text())) {
      console.log(`[browser-state] ${message.text()}`);
    }
  });
};

export const inputTrace = (page) =>
  page.evaluate(() => ({
    view: document.querySelector('main[data-view]')?.dataset.view,
    focused: document.hasFocus(),
    events: globalThis.browserInputTrace,
    details: globalThis.browserDetailsTrace,
    questionPanel: (() => {
      const panel = document.querySelector('[data-question-controls]');
      return panel
        ? {
            open: panel.open,
            editorVisible: Boolean(
              panel.querySelector('[data-answer-rule]')?.getClientRects().length
            ),
          }
        : null;
    })(),
  }));

/** Native disclosure state only; bounded per document and used by fixtures. */
export const traceBrowserDetails = (page, selector) =>
  page.addInitScript((rootSelector) => {
    const nodes = new WeakMap();
    let next = 0;
    const trace = (globalThis.browserDetailsTrace = []);
    const record = (event) => {
      const target = event.target?.closest?.('details');
      const root = target?.closest(rootSelector);
      if (
        !root ||
        (event.type === 'click' && !event.target.closest('summary'))
      ) {
        return;
      }
      if (!nodes.has(target)) {
        nodes.set(target, ++next);
      }
      trace.push({
        type: event.type,
        node: nodes.get(target),
        open: target.open,
        rootOpen: root.open,
        summary: target
          .querySelector(':scope > summary')
          ?.textContent?.slice(0, 100),
      });
      if (trace.length > 60) {
        trace.shift();
      }
    };
    for (const type of ['click', 'toggle']) {
      globalThis.addEventListener(type, record, true);
    }
  }, selector);
