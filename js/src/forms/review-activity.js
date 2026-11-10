/** Track activity without reading keys, text, cookies or any form values. */
const observeActivity = (binding) => {
  let last = 0;
  const report = (event) => {
    const time = Date.now();
    if (
      event.isTrusted &&
      time - last >= 1000 &&
      typeof globalThis[binding] === 'function'
    ) {
      last = time;
      Promise.resolve(globalThis[binding]()).catch(() => {});
    }
  };
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) {
    globalThis.addEventListener(type, report, { capture: true, passive: true });
  }
};

export const trackReviewActivity = async (
  page,
  id,
  touched,
  { initializeCurrent = false } = {}
) => {
  if (!page?.exposeBinding || !page?.addInitScript) {
    return false;
  }
  const binding = `__formActivity_${id.replaceAll('-', '')}`;
  await page.exposeBinding(binding, touched);
  await page.addInitScript(observeActivity, binding);
  if (initializeCurrent) {
    for (const frame of page.frames()) {
      await frame.evaluate(observeActivity, binding);
    }
  }
  return true;
};
