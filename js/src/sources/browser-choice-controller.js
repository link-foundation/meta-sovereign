/* global document, window */
import { writeBrowserNativeInput } from './browser-native-input.js';
import {
  watchChoiceView,
  revealChoiceReply,
} from './browser-choice-visibility.js';
import { armBrowserReply } from './browser-reply-guard.js';

/** Page-local ownership and one-use event guards. Never returns composer text. */
export const createChoiceContext = (input, read) => {
  const { spec, expected } = input;
  const key = Symbol.for('meta-sovereign.browser-answer-choice.v1');
  const state = (window[key] ??= {
    owners: new WeakMap(),
    observed: new WeakSet(),
    attempts: new Map(),
  });
  const snapshot = (historyOnly = false) => read(spec, true, historyOnly);
  const inactiveKey = Symbol.for('meta-sovereign.browser-inactive-view.v1');
  const inactive = input.inactiveToken && window[inactiveKey];
  const inactiveReady = () =>
    !input.inactiveToken ||
    (inactive &&
      window[inactiveKey] === inactive &&
      inactive.token === input.inactiveToken &&
      !inactive.interrupted &&
      !document.hasFocus());
  const identity = (value) =>
    JSON.stringify([value.chat, value.question?.id, value.question?.body]);
  const ownershipIdentity = (value) =>
    JSON.stringify([identity(value), value.pendingTurn]);
  const samePending = (value) =>
    expected.pendingTurn
      ? JSON.stringify(value.pendingTurn) ===
        JSON.stringify(expected.pendingTurn)
      : expected.pendingMessages
        ? JSON.stringify(value.pendingTurn?.messages) ===
          JSON.stringify(expected.pendingMessages)
        : value.pendingTurn?.messages.length === 1;
  const same = (value) =>
    inactiveReady() &&
    !value.code &&
    !value.question.outgoing &&
    identity(value) === identity(expected) &&
    samePending(value) &&
    (!expected.noticeContext ||
      JSON.stringify(value.noticeContext) ===
        JSON.stringify(expected.noticeContext)) &&
    JSON.stringify(value.answerOptions) ===
      JSON.stringify(expected.answerOptions);
  const valueOf = (node) =>
    node ? String('value' in node ? node.value : (node.textContent ?? '')) : '';
  const writable = (node) =>
    Boolean(node) &&
    !node.matches(
      ':disabled,[disabled],[readonly],[inert],[aria-disabled="true"],[aria-readonly="true"]'
    ) &&
    !node.closest('[inert],[aria-disabled="true"]');
  const write = (node, value) => {
    if (!writable(node) || !inactiveReady()) {
      return false;
    }
    state.writing = true;
    try {
      return writeBrowserNativeInput(node, value, inactive);
    } finally {
      state.writing = false;
    }
  };
  const clearOwned = (current) => {
    const node = current.composer;
    const owner = node && state.owners.get(node);
    if (
      owner &&
      owner.identity === ownershipIdentity(current) &&
      valueOf(node) === owner.text
    ) {
      const attempt = state.attempts.get(identity(current));
      if (attempt?.allowed && !attempt.confirmed) {
        return false;
      }
      state.owners.delete(node);
      return write(node, '');
    }
    return !valueOf(node);
  };
  const own = (current, text) => {
    const node = current.composer;
    const owner = { identity: ownershipIdentity(current), text };
    state.owners.set(node, owner);
    if (!state.observed.has(node)) {
      state.observed.add(node);
      node.addEventListener('input', () => {
        if (!state.writing) {
          state.owners.delete(node);
        }
      });
    }
    return owner;
  };
  const clean = (attempt) => {
    attempt.clearDraft?.();
    watchChoiceView(attempt, true);
    attempt.node.removeAttribute('data-meta-answer-choice');
    for (const node of document.querySelectorAll('[data-meta-answer-choice]')) {
      if (node.getAttribute('data-meta-answer-choice') === attempt.token) {
        node.removeAttribute('data-meta-answer-choice');
      }
    }
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      document.removeEventListener(type, attempt.guard, true);
    }
  };
  return {
    state,
    snapshot,
    identity,
    ownershipIdentity,
    same,
    valueOf,
    writable,
    own,
    write,
    clearOwned,
    clean,
  };
};

/** Reading history must not clear or acquire the provider composer. */
export const readChoiceHistory = (_input, { snapshot }) => snapshot(true);

export const readChoicePublic = (input, context) => {
  const { snapshot, clearOwned, valueOf } = context;
  const current = snapshot();
  if (current.code) {
    return current;
  }
  if (!input.preserveDraft && current.optionsShown.length) {
    clearOwned(current);
  }
  const { controls: _controls, composer, ...result } = current;
  return { ...result, hasDraft: Boolean(valueOf(composer)) };
};

export const prefillChoiceDraft = (input, context) => {
  const { snapshot, same, valueOf, write, own } = context;
  const current = snapshot();
  if (
    !same(current) ||
    current.strictOptions ||
    !current.composer ||
    valueOf(current.composer)
  ) {
    return { code: 'answer-draft-preserved' };
  }
  const node = current.composer;
  if (!write(node, input.text)) {
    return { code: 'answer-prefill-unverified' };
  }
  own(current, input.text);
  return same(snapshot())
    ? { prefilled: true }
    : { code: 'answer-prefill-unverified' };
};

export const armChoiceClick = (input, context) => {
  const { option } = input;
  const { snapshot, same, clearOwned, valueOf } = context;
  const current = snapshot();
  const candidates =
    current.controls?.filter(
      (node) => String(node.textContent).replace(/\s+/gu, ' ').trim() === option
    ) ?? [];
  if (!same(current) || !current.strictOptions || candidates.length !== 1) {
    return { code: 'answer-choice-changed' };
  }
  if (!clearOwned(current)) {
    return { code: 'answer-draft-preserved' };
  }
  return armBrowserReply(
    input,
    context,
    current,
    candidates[0],
    (fresh, attempt) =>
      same(fresh) &&
      fresh.controls.includes(attempt.node) &&
      !valueOf(fresh.composer)
  );
};

export const matchingChoiceReplies = (input, current, attempt) => {
  const { expected, option } = input;
  const questionIndex =
    current.messages?.findIndex((row) => row.id === expected.question.id) ?? -1;
  const matchesReply = (row) =>
    row.outgoing &&
    !row.service &&
    !attempt.before.includes(row.id) &&
    row.body === (option ?? input.text);
  return !current.code && current.chat === expected.chat && questionIndex >= 0
    ? current.messages.slice(questionIndex + 1).filter(matchesReply)
    : [];
};

export const readChoiceReceipt = (input, context) => {
  const { state, snapshot, clean } = context;
  const attempt = [...state.attempts.values()].find(
    (entry) => entry.token === input.token
  );
  if (!attempt) {
    return { code: 'send-unknown' };
  }
  const current = snapshot();
  const matches = matchingChoiceReplies(input, current, attempt);
  const confirmed =
    (input.text === undefined ? attempt.allowed : attempt.clicked) &&
    matches.length === 1;
  if (confirmed || input.finish) {
    clean(attempt);
  }
  if (confirmed) {
    if (!attempt.confirmed) {
      attempt.reveal = revealChoiceReply(
        input.spec,
        attempt,
        current,
        matches[0]
      );
    }
    attempt.confirmed = true;
    return { sent: true, messageId: matches[0].id, reveal: attempt.reveal };
  }
  if (input.finish && !attempt.allowed && attempt.blocked) {
    state.attempts.delete(attempt.reservation);
    return {
      code:
        input.text === undefined
          ? 'answer-choice-changed'
          : 'answer-text-changed',
      dispatched: false,
    };
  }
  return { code: 'send-unknown', blocked: Boolean(attempt.blocked) };
};

/** Remove temporary event hooks even when host/frame verification was lost. */
export const releaseChoiceClick = ({ token }, { state, clean }) => {
  const attempt = [...state.attempts.values()].find(
    (entry) => entry.token === token
  );
  if (attempt) {
    clean(attempt);
  }
  // Keep the reservation: cleanup does not prove whether dispatch happened.
  return { released: true };
};
