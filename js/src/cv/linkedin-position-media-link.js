const hostAndPath = /^(?:[\p{L}\d-]+\.)+[\p{L}]{2,}(?::\d+)?(?:[/?#]\S*)?$/iu;

export const linkedinPositionMediaUrl = (value, allowBare = true) => {
  if (typeof value !== 'string' || value.length > 2000) {
    return null;
  }
  const input = value.trim();
  try {
    const url = new URL(
      allowBare && hostAndPath.test(input) ? `https://${input}` : input
    );
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

export const linkedinPositionMediaTitle = (url) => {
  const parsed = new URL(url);
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  return `${parsed.host.replace(/^www\./u, '')}${path}${parsed.search}${parsed.hash}`;
};

/** Honor one explicit company website and keep ambiguous prose for review. */
export const linkedinPositionMediaCandidate = (
  { source, target },
  { legacy = false, rename = false } = {}
) => {
  const explicit = source?.native?.website;
  const urls = explicit
    ? [explicit]
    : legacy
      ? []
      : [
          ...(source?.description ?? '').matchAll(
            /^[\t ]*(?:website|сайт|веб-сайт):[\t ]*([^\r\n]+)$/gimu
          ),
        ].map((match) => match[1]);
  const canonical = (value) => linkedinPositionMediaUrl(value, !legacy);
  const distinct = [...new Set(urls.map(canonical))];
  if (distinct.length !== 1 || !distinct[0]) {
    return { url: null, review: urls.length > 0 };
  }
  const [url] = distinct;
  const existing = (Array.isArray(target?.media) ? target.media : []).filter(
    (item) => canonical(item?.url) === url
  );
  const previousTitle = existing[0]?.title;
  if (
    rename &&
    existing.length === 1 &&
    previousTitle &&
    previousTitle === target.company &&
    previousTitle !== linkedinPositionMediaTitle(url)
  ) {
    return { url, review: false, previousTitle };
  }
  return { url: existing.length ? null : url, review: false };
};
