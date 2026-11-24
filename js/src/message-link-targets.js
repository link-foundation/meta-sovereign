/** Optional bounded metadata; absent and empty targets share the legacy shape. */
export const messageLinkProperties = (links) => {
  if (links === undefined) {
    return {};
  }
  if (
    !Array.isArray(links) ||
    links.length > 20 ||
    !links.every(
      (link) =>
        typeof link === 'string' && Boolean(link.trim()) && link.length <= 2000
    ) ||
    links.reduce((size, link) => size + link.length, 0) > 6000
  ) {
    throw Object.assign(
      new Error('Message link targets must be bounded text.'),
      {
        code: 'question-links-invalid',
      }
    );
  }
  return links.length ? { links: [...links] } : {};
};
