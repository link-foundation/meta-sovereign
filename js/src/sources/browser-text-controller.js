/* global document */
import { browserFrameVisible } from './browser-choice-document.js';
import {
  browserReplyAdmission,
  armBrowserReply,
} from './browser-reply-guard.js';

export const textReplyOpen = (spec) => {
  const nodes = [
    ...document.querySelectorAll('p,span,div,[role="status"],[role="alert"]'),
  ];
  if (nodes.length > 5000) {
    return false;
  }
  const pattern = new RegExp(spec.textReply.closedText, 'iu');
  return !nodes.some(
    (node) =>
      !node.children.length &&
      browserFrameVisible(node) &&
      pattern.test(node.textContent)
  );
};

const textReplyButtons = (spec) =>
  [...document.querySelectorAll(spec.textReply.send)].filter(
    (node) =>
      browserFrameVisible(node) &&
      !node.matches(':disabled,[disabled],[aria-disabled="true"]') &&
      !node.closest('[inert],[aria-disabled="true"]')
  );

/** Fill only an empty writable composer and arm one verified native send. */
export const armTextReply = (input, context) => {
  const {
    snapshot,
    same,
    state,
    identity,
    own,
    valueOf,
    write,
    writable,
    clearOwned,
  } = context;
  const current = snapshot();
  if (
    !same(current) ||
    current.strictOptions ||
    !writable(current.composer) ||
    !textReplyOpen(input.spec)
  ) {
    return { code: 'answer-text-changed' };
  }
  if (valueOf(current.composer)) {
    return { code: 'answer-draft-preserved' };
  }
  const code = browserReplyAdmission(state, identity(current));
  if (code) {
    return { code };
  }
  const composer = current.composer;
  if (!write(composer, input.text)) {
    return { code: 'answer-prefill-unverified' };
  }
  const owner = own(current, input.text);
  const valid = (fresh, attempt) =>
    same(fresh) &&
    !fresh.strictOptions &&
    textReplyOpen(input.spec) &&
    fresh.composer === composer &&
    writable(composer) &&
    state.owners.get(composer) === owner &&
    valueOf(composer) === input.text &&
    !attempt.preserveView &&
    textReplyButtons(input.spec).length === 1 &&
    textReplyButtons(input.spec)[0] === attempt.node;
  const buttons = textReplyButtons(input.spec);
  const fresh = snapshot();
  if (buttons.length !== 1 || !valid(fresh, { node: buttons[0] })) {
    clearOwned(current);
    return { code: 'answer-text-changed' };
  }
  const armed = armBrowserReply(input, context, fresh, buttons[0], valid);
  const attempt = state.attempts.get(identity(current));
  if (armed.armed) {
    attempt.clearDraft = () => {
      if (!attempt.allowed && state.owners.get(composer) === owner) {
        clearOwned(current);
      }
    };
  } else {
    clearOwned(current);
  }
  return armed;
};

export { textReplyButtons };
