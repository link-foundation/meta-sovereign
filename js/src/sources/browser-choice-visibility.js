/* global document */

/** Owner activity during delivery keeps control of the conversation view. */
export const watchChoiceView = (attempt, stop = false) => {
  if (!stop) {
    attempt.viewChanged = (event) => {
      if (
        event.type !== 'pointerdown' ||
        (event.target !== attempt.node && !attempt.node.contains(event.target))
      ) {
        attempt.preserveView = true;
      }
    };
  }
  for (const type of [
    'wheel',
    'touchmove',
    'keydown',
    'input',
    'pointerdown',
  ]) {
    document[stop ? 'removeEventListener' : 'addEventListener'](
      type,
      attempt.viewChanged,
      true
    );
  }
};

/** Reveal only a confirmed bubble, once, while the owner has left the view alone. */
export const revealChoiceReply = (spec, attempt, current, message) => {
  if (attempt.preserveView) {
    return 'owner-activity';
  }
  const composer = current.composer;
  if (composer && String(composer.value ?? composer.textContent ?? '')) {
    return 'owner-draft';
  }
  const pattern = new RegExp(spec.messages.idPattern);
  const nodes = [...document.querySelectorAll(spec.messages.item)].filter(
    (node) =>
      pattern.exec(node.getAttribute(spec.messages.idAttribute) ?? '')?.[1] ===
      message.id
  );
  if (nodes.length !== 1) {
    return 'unavailable';
  }
  try {
    nodes[0].scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant',
    });
    return 'revealed';
  } catch {
    // A view failure cannot erase a positive delivery receipt or permit a retry.
    return 'unavailable';
  }
};
