/* global document, window */

/** Read observed native header facts without inventing missing metadata. */
export const browserPaneHeader = (spec) => {
  const header = [];
  for (const selector of spec.paneIdentity.fields) {
    const nodes = [...document.querySelectorAll(selector)];
    if (nodes.length > 1) {
      return { code: 'answer-chat-unverified' };
    }
    const node = nodes[0];
    const text = String(node?.textContent ?? '')
      .replace(/\s+/gu, ' ')
      .trim();
    const href = node?.getAttribute('href') ?? '';
    if (text.length > 4096 || href.length > 4096) {
      return { code: 'answer-chat-unverified' };
    }
    header.push([text, href]);
  }
  return {
    fingerprint: JSON.stringify(header),
    ready: header.every(([text, href]) => text || href),
  };
};

/** Remember observed native ownership; SPA routing alone does not prove a pane. */
export const browserPaneIdentity = (spec, chat, messages) => {
  if (!spec.paneIdentity) {
    return null;
  }
  const header = browserPaneHeader(spec);
  if (header.code) {
    return header;
  }
  const { fingerprint, ready } = header;
  const key = Symbol.for('meta-sovereign.browser-pane-identity.v1');
  const state = (window[key] ??= { owners: new Map(), headers: new Map() });
  if (
    (state.headers.has(chat) && state.headers.get(chat) !== fingerprint) ||
    messages.some((row) => {
      const owner = state.owners.get(row.id);
      return owner !== undefined && owner !== chat;
    })
  ) {
    return { code: 'answer-chat-unverified' };
  }
  const added = messages.filter((row) => !state.owners.has(row.id)).length;
  if (
    state.owners.size + added > 20000 ||
    (ready && !state.headers.has(chat) && state.headers.size >= 512)
  ) {
    return { code: 'answer-history-limited' };
  }
  // Empty mounts do not establish ownership of a replacement conversation.
  if (messages.length) {
    if (ready) {
      state.headers.set(chat, fingerprint);
    }
    for (const row of messages) {
      state.owners.set(row.id, chat);
    }
  }
  return null;
};
