/** Synthetic instructions and controlled CV fields; no account or network data. */
export const hhContentMarkup = (marker, hidden = false, workplace = false) => `
<!doctype html><html lang="en"><title>Private synthetic task</title><body>
<main><h1>Task instructions</h1><p>Private synthetic employer instructions.</p>
${
  workplace
    ? `
<input name="company" value="Employer"><input name="position" value="Engineer">
<textarea data-qa="resume-editor-experience-description-input">Native CV prose.</textarea>
<input data-qa="resume-editor-experience-start-year-input" value="2020">
<span data-qa="resume-editor-experience-start-month-input"><span data-qa="trigger-values-wrapper">January</span></span>
<input type="checkbox" data-qa="resume-editor-experience-present-checkbox" checked>
<input type="checkbox" data-qa="profile-resumes-list-checkbox-english" checked>
`
    : '<textarea data-qa="resume-editor-about">Native CV prose.</textarea>'
}
<section id="challenge" ${hidden ? 'hidden' : ''}>
<h2>Private synthetic verification instructions</h2><input ${marker === 'qa' ? 'data-qa="account-captcha-input"' : 'name="captchaText"'} value="Owner-only synthetic answer">
</section></main></body></html>`;

/** Count sensitive native getters without reading or writing their contents. */
export const observeHhContentReads = () => {
  globalThis.hhContentReads = 0;
  globalThis.hhContentActions = 0;
  for (const event of ['input', 'change', 'click', 'submit']) {
    document.addEventListener(event, () => {
      globalThis.hhContentActions++;
    });
  }
  const count = () => {
    globalThis.hhContentReads++;
  };
  for (const node of document.querySelectorAll('input,textarea')) {
    const prototype =
      node.tagName === 'INPUT'
        ? globalThis.HTMLInputElement.prototype
        : globalThis.HTMLTextAreaElement.prototype;
    for (const key of [
      'value',
      ...(node.type === 'checkbox' ? ['checked'] : []),
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      Object.defineProperty(node, key, {
        configurable: true,
        get() {
          count();
          return descriptor.get.call(this);
        },
      });
    }
    Object.defineProperty(node, '__reactProps$fixture', {
      configurable: true,
      get() {
        count();
        return { value: 'Native CV prose.', onChange() {} };
      },
    });
  }
  Object.defineProperty(document, 'title', {
    configurable: true,
    get() {
      count();
      return 'Private synthetic task';
    },
  });
  const walk = document.createTreeWalker.bind(document);
  document.createTreeWalker = (...args) => {
    count();
    return walk(...args);
  };
};
