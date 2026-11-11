/* global document, window, Event, HTMLTextAreaElement, HTMLInputElement */

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
  const identity = (value) =>
    JSON.stringify([value.chat, value.question?.id, value.question?.body]);
  const ownershipIdentity = (value) =>
    JSON.stringify([identity(value), value.pendingTurn]);
  const samePending = (value) =>
    expected.pendingTurn
      ? JSON.stringify(value.pendingTurn) ===
        JSON.stringify(expected.pendingTurn)
      : value.pendingTurn?.messages.length === 1;
  const same = (value) =>
    !value.code &&
    !value.question.outgoing &&
    identity(value) === identity(expected) &&
    samePending(value) &&
    JSON.stringify(value.answerOptions) ===
      JSON.stringify(expected.answerOptions);
  const valueOf = (node) =>
    node ? String('value' in node ? node.value : (node.textContent ?? '')) : '';
  const write = (node, value) => {
    if (
      node.matches(':disabled,[readonly],[inert]') ||
      node.closest('[inert]')
    ) {
      return false;
    }
    const prototype =
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter || !('value' in node)) {
      return false;
    }
    state.writing = true;
    try {
      setter.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return valueOf(node) === value;
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
      state.owners.delete(node);
      return write(node, '');
    }
    return !valueOf(node);
  };
  const clean = (attempt) => {
    attempt.node.removeAttribute('data-meta-answer-choice');
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
    write,
    clearOwned,
    clean,
  };
};

/** Reading history must not clear or acquire the provider composer. */
export const readChoiceHistory = (_input, { snapshot }) => snapshot(true);

export const readChoicePublic = (_input, context) => {
  const { snapshot, clearOwned, valueOf } = context;
  const current = snapshot();
  if (current.code) {
    return current;
  }
  if (current.optionsShown.length) {
    clearOwned(current);
  }
  const { controls: _controls, composer, ...result } = current;
  return { ...result, hasDraft: Boolean(valueOf(composer)) };
};

export const prefillChoiceDraft = (input, context) => {
  const { snapshot, same, valueOf, write, state, ownershipIdentity } = context;
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
  state.owners.set(node, {
    identity: ownershipIdentity(current),
    text: input.text,
  });
  if (!state.observed.has(node)) {
    state.observed.add(node);
    node.addEventListener('input', () => {
      if (!state.writing) {
        state.owners.delete(node);
      }
    });
  }
  return same(snapshot())
    ? { prefilled: true }
    : { code: 'answer-prefill-unverified' };
};

export const armChoiceClick = (input, context) => {
  const { token, option } = input;
  const { snapshot, same, clearOwned, state, identity, valueOf } = context;
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
  const reservation = identity(current);
  if (state.attempts.has(reservation)) {
    return { code: 'send-in-doubt' };
  }
  if (state.attempts.size >= 32) {
    const completed = [...state.attempts].find(
      ([_key, attempt]) => attempt.confirmed
    );
    if (!completed) {
      return { code: 'answer-choice-capacity' };
    }
    state.attempts.delete(completed[0]);
  }
  const attempt = {
    node: candidates[0],
    token,
    reservation,
    before: current.messages.map((row) => row.id),
    allowed: false,
    clicked: false,
  };
  attempt.guard = (event) => {
    if (event.target !== attempt.node && !attempt.node.contains(event.target)) {
      return;
    }
    const fresh = snapshot();
    const valid =
      same(fresh) &&
      fresh.controls.includes(attempt.node) &&
      !valueOf(fresh.composer) &&
      !attempt.clicked;
    if (!valid) {
      event.preventDefault();
      event.stopImmediatePropagation();
      attempt.blocked = true;
      return;
    }
    attempt.allowed = true;
    attempt.clicked ||= event.type === 'click';
  };
  attempt.node.setAttribute('data-meta-answer-choice', token);
  for (const type of ['pointerdown', 'mousedown', 'click']) {
    document.addEventListener(type, attempt.guard, true);
  }
  state.attempts.set(reservation, attempt);
  return { armed: true, selector: `[data-meta-answer-choice="${token}"]` };
};

export const readChoiceReceipt = (input, context) => {
  const { token, expected, option } = input;
  const { state, snapshot, clean } = context;
  const attempt = [...state.attempts.values()].find(
    (entry) => entry.token === token
  );
  if (!attempt) {
    return { code: 'send-unknown' };
  }
  const current = snapshot();
  const questionIndex =
    current.messages?.findIndex((row) => row.id === expected.question.id) ?? -1;
  const matches =
    !current.code && current.chat === expected.chat && questionIndex >= 0
      ? current.messages
          .slice(questionIndex + 1)
          .filter(
            (row) =>
              row.outgoing &&
              !row.service &&
              !attempt.before.includes(row.id) &&
              row.body === option
          )
      : [];
  const confirmed = attempt.allowed && matches.length === 1;
  if (confirmed || input.finish) {
    clean(attempt);
  }
  if (confirmed) {
    attempt.confirmed = true;
    return { sent: true, messageId: matches[0].id };
  }
  if (input.finish && !attempt.allowed && attempt.blocked) {
    state.attempts.delete(attempt.reservation);
    return { code: 'answer-choice-changed', dispatched: false };
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
