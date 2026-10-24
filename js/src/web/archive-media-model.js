// What the page needs to know about an imported archive attachment
// (R-Z15); pure, so it is tested without a browser.

// `media/<network>/<64 hex>[.ext]`, the only paths the importers write.
const STORED = /^media\/([a-z]{1,16})\/([0-9a-f]{64}(?:\.[a-z0-9]{1,8})?)$/;

// What older WhatsApp imports stored: `type`, no `kind`.
const LEGACY_KIND = { image: 'photo', document: 'file', contact: 'file' };

/** The server path (`/api/media/...`) of a stored attachment, or null. */
export const mediaPathOf = (attachment) => {
  const m = STORED.exec(String(attachment?.path ?? ''));
  return m ? `/api/media/${m[1]}/${m[2]}` : null;
};

/** One attachment as the page draws it. */
export const archiveItem = (attachment) => {
  const a = attachment ?? {};
  return {
    kind: a.kind ?? LEGACY_KIND[a.type] ?? a.type ?? 'file',
    name: a.name ?? null,
    size: Number(a.size) || 0,
    path: mediaPathOf(a),
    url: /^https?:\/\//.test(a.url ?? '') ? a.url : null,
    omitted: Boolean(a.omitted),
    caption: a.caption ?? null,
  };
};
