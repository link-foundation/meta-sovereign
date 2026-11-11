/* global document, location, getComputedStyle */

/** Distinguish unscoped greeting chips from actual provider answer controls. */
export const browserChoiceSuggestions = (spec, group, all, visible, text) => {
  if (
    !spec.choices.genericGroup ||
    !group.matches(spec.choices.genericGroup) ||
    group.closest(spec.messages.item)
  ) {
    return false;
  }
  const offered = all.filter((node) => group.contains(node) && visible(node));
  const pattern = new RegExp(spec.choices.genericPattern, 'iu');
  return offered.length > 0 && offered.some((node) => pattern.test(text(node)));
};

/** Composed with the static suggestion classifier; provider text stays data. */
export const readBrowserChoices = (spec, internal = false) => {
  const text = (node) =>
    String(node?.textContent ?? '')
      .replace(/\s+/gu, ' ')
      .trim();
  const visible = (node) => {
    if (!node?.isConnected || !node.getClientRects().length) {
      return false;
    }
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (
        parent.hidden ||
        parent.getAttribute('aria-hidden') === 'true' ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        return false;
      }
    }
    return true;
  };
  const unavailable = (code) => ({ code });
  const validLocation = (url, match) =>
    spec.location.origins.includes(url.origin) && Boolean(match?.[1]);
  const validRows = (rows) =>
    !rows.some((row) => !row.id || row.body.length > 6000) &&
    new Set(rows.map((row) => row.id)).size === rows.length;
  const validControls = (controls) =>
    controls.length <= 100 &&
    !controls.some((node) => !text(node) || text(node).length > 6000);
  const bodyOf = (node) =>
    String(node.querySelector(spec.messages.body)?.innerText ?? '').trim();
  const hasQuestion = (latest) => Boolean(latest?.body);
  const url = new URL(location.href);
  const match = new RegExp(spec.location.pathPattern).exec(url.pathname);
  if (!validLocation(url, match)) {
    return unavailable('answer-chat-unverified');
  }
  const chat = match[1];
  const candidates = [...document.querySelectorAll(spec.messages.item)];
  if (candidates.length > 500) {
    return unavailable('answer-history-limited');
  }
  const idPattern = new RegExp(spec.messages.idPattern);
  const rows = candidates.filter(visible).map((node) => ({
    node,
    id: idPattern.exec(node.getAttribute(spec.messages.idAttribute) ?? '')?.[1],
    body: bodyOf(node),
    outgoing:
      node.matches(spec.messages.outgoing) ||
      Boolean(node.querySelector(spec.messages.outgoing)),
  }));
  if (!validRows(rows)) {
    return unavailable('answer-history-unverified');
  }
  const latest = rows.at(-1);
  if (!hasQuestion(latest)) {
    return unavailable('answer-question-unavailable');
  }
  const all = [...document.querySelectorAll(spec.choices.button)];
  if (all.length > 1000) {
    return unavailable('answer-options-limited');
  }
  const groups = [...document.querySelectorAll(spec.choices.group)].filter(
    (group) =>
      visible(group) &&
      !browserChoiceSuggestions(spec, group, all, visible, text)
  );
  const attached = groups
    .filter((group) => {
      const dialog = group.closest('[role="dialog"]');
      if (dialog && !dialog.contains(latest.node)) {
        return false;
      }
      const parent = group.closest(spec.messages.item);
      if (parent) {
        return parent === latest.node;
      }
      const bound = group.getAttribute(
        spec.choices.questionAttribute ?? 'data-question-id'
      );
      return bound
        ? bound === latest.id
        : Boolean(latest.node.compareDocumentPosition(group) & 4);
    })
    .filter(
      (group, _index, selected) =>
        !selected.some((other) => other !== group && group.contains(other))
    );
  if (groups.length > 100 || attached.length > 1) {
    return unavailable('answer-options-ambiguous');
  }
  const shown = all.filter(visible);
  const yes = /^(?:yes|да|हाँ|是)[.!]?$/iu;
  const no = /^(?:no|нет|नहीं|否)[.!]?$/iu;
  const unscoped = shown.filter((node) => {
    const owner = node.closest(spec.messages.item);
    const dialog = node.closest('[role="dialog"]');
    return (
      (!owner || owner === latest.node) &&
      (!dialog || dialog.contains(latest.node)) &&
      !groups.some((group) => group.contains(node)) &&
      (yes.test(text(node)) || no.test(text(node)))
    );
  });
  const pair =
    unscoped.length === 2 &&
    unscoped.some((node) => yes.test(text(node))) &&
    unscoped.some((node) => no.test(text(node)));
  const controls = shown.filter(
    (node) =>
      attached.some((group) => group.contains(node)) ||
      (spec.choices.attachedButtons && latest.node.contains(node)) ||
      (pair && unscoped.includes(node))
  );
  if (!validControls(controls)) {
    return unavailable('answer-options-unverified');
  }
  const enabled = controls.filter(
    (node) =>
      !node.matches(':disabled,[disabled],[aria-disabled="true"]') &&
      !node.closest('[inert],[aria-disabled="true"]')
  );
  const composers = [...document.querySelectorAll(spec.composer)].filter(
    visible
  );
  if (composers.length > 1) {
    return unavailable('answer-composer-ambiguous');
  }
  const result = {
    chat,
    question: { id: latest.id, body: latest.body, outgoing: latest.outgoing },
    strictOptions: [attached.length, pair, controls.length].some(Boolean),
    answerOptions: enabled.map(text),
    optionsShown: controls.map(text),
    messages: rows.map(({ node, ...row }) => ({
      ...row,
      timestamp: spec.messages.timestampAttribute
        ? node.getAttribute(spec.messages.timestampAttribute)
        : null,
    })),
  };
  return internal
    ? { ...result, controls: enabled, composer: composers[0] }
    : result;
};
