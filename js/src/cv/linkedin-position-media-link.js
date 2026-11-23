const hostAndPath = /^(?:[\p{L}\d-]+\.)+[\p{L}]{2,}(?::\d+)?(?:[/?#]\S*)?$/iu;

export const linkedinPositionMediaUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2000) {
    return null;
  }
  const input = value.trim();
  try {
    const url = new URL(hostAndPath.test(input) ? `https://${input}` : input);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

/** Honor one explicit company website and keep ambiguous prose for review. */
export const linkedinPositionMediaCandidate = ({ source, target }) => {
  const explicit = source?.native?.website;
  const urls = explicit
    ? [explicit]
    : [
        ...(source?.description ?? '').matchAll(
          /^[\t ]*(?:website|сайт|веб-сайт):[\t ]*([^\r\n]+)$/gimu
        ),
      ].map((match) => match[1]);
  const distinct = [...new Set(urls.map(linkedinPositionMediaUrl))];
  if (distinct.length !== 1 || !distinct[0]) {
    return { url: null, review: urls.length > 0 };
  }
  const [url] = distinct;
  const exists = (Array.isArray(target?.media) ? target.media : []).some(
    (item) => linkedinPositionMediaUrl(item?.url) === url
  );
  return { url: exists ? null : url, review: false };
};
