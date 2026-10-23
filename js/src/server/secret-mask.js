/**
 * What the page may learn about a saved secret (R-Z1): that it exists, not
 * what it is. The server uses the raw value itself (it reads the store, not
 * HTTP), so a `GET /links?prefix=secret:` answer — which a page on another
 * site could read if it got past the origin rules — carries no token and no
 * Telegram session.
 *
 * The browser-only mode (the hosted page without a server) keeps its own
 * secrets in the browser's own store and never asks the server for them.
 */

const isSecret = (link) =>
  typeof link?.id === 'string' && link.id.startsWith('secret:');

/**
 * A secret link as `{ id, tokens?, updated?, present: true, masked: true }`;
 * any other link unchanged.
 */
export const maskSecret = (link) => {
  if (!isSecret(link)) {
    return link;
  }
  const out = { id: link.id, present: true, masked: true };
  if (Array.isArray(link.tokens)) {
    out.tokens = link.tokens;
  }
  if (typeof link.updated === 'string') {
    out.updated = link.updated;
  }
  return out;
};

export const maskSecrets = (links) => links.map(maskSecret);
