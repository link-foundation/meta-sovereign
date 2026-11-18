/* global document */
import { watchChoiceView } from './browser-choice-visibility.js';

/** Native buttons and text replies share one private question reservation. */
export const browserReplyAdmission = (state, reservation) => {
  if (state.attempts.has(reservation)) {
    return 'send-in-doubt';
  }
  if (state.attempts.size >= 32) {
    const completed = [...state.attempts].find(
      ([_key, attempt]) => attempt.confirmed
    );
    if (!completed) {
      return 'answer-choice-capacity';
    }
    state.attempts.delete(completed[0]);
  }
  return null;
};

/** Guard every native pointer stage against a replaced question or composer. */
export const armBrowserReply = (input, context, current, node, valid) => {
  const { state, identity, snapshot } = context;
  const reservation = identity(current);
  const code = browserReplyAdmission(state, reservation);
  if (code) {
    return { code };
  }
  const attempt = {
    node,
    token: input.token,
    reservation,
    before: current.messages.map((row) => row.id),
    allowed: false,
    clicked: false,
  };
  const selector = `[data-meta-answer-choice="${input.token}"]`;
  attempt.guard = (event) => {
    const tagged = event.target.closest?.(selector);
    if (
      !tagged &&
      event.target !== attempt.node &&
      !attempt.node.contains(event.target)
    ) {
      return;
    }
    if (
      tagged !== attempt.node ||
      !valid(snapshot(), attempt) ||
      attempt.clicked
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      attempt.blocked = true;
      return;
    }
    attempt.allowed = true;
    attempt.clicked ||= event.type === 'click';
  };
  node.setAttribute('data-meta-answer-choice', input.token);
  watchChoiceView(attempt);
  for (const type of ['pointerdown', 'mousedown', 'click']) {
    document.addEventListener(type, attempt.guard, true);
  }
  state.attempts.set(reservation, attempt);
  return { armed: true, selector };
};
