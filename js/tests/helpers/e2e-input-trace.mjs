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
  }));
