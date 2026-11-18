/* global document, window, getComputedStyle */

/** Page-local identity checks; provider draft text never leaves the page. */
export const browserComposerDraft = (input) => {
  const key = Symbol.for('meta-sovereign.browser-composer-draft.v1');
  const previous = window[key];
  if (input.operation === 'release') {
    if (previous?.token === input.token) {
      delete window[key];
    }
    return { verified: true };
  }
  const visible = (node) => {
    const style = getComputedStyle(node);
    return (
      node.getClientRects().length > 0 &&
      style.visibility === 'visible' &&
      !node.closest('[hidden],[inert],[aria-hidden="true"]')
    );
  };
  const nodes = [...document.querySelectorAll(input.selector)].filter(visible);
  if (nodes.length !== 1) {
    return { code: 'composer-unverified' };
  }
  const node = nodes[0];
  if (
    node.matches(
      ':disabled,[disabled],[readonly],[aria-readonly="true"],[contenteditable="false"]'
    ) ||
    node.closest('[aria-disabled="true"]')
  ) {
    return { code: 'composer-unverified' };
  }
  const value = String('value' in node ? node.value : node.innerText);
  if (input.operation === 'begin') {
    if (value) {
      return { code: 'answer-draft-preserved' };
    }
    window[key] = { token: input.token, node, url: window.location.href };
    return { verified: true };
  }
  if (
    previous?.token !== input.token ||
    previous.node !== node ||
    previous.url !== window.location.href ||
    value !== input.text
  ) {
    return { code: 'answer-draft-preserved' };
  }
  return { verified: true, contentEditable: !('value' in node) };
};

export const verifyBrowserComposer = async (commander, input) => {
  const result = await commander.evaluate({
    fn: browserComposerDraft,
    args: [input],
  });
  if (result?.verified !== true) {
    throw Object.assign(
      new Error('The provider composer changed or contains an owner draft'),
      { code: result?.code ?? 'composer-unverified', fallback: false }
    );
  }
  return result;
};
