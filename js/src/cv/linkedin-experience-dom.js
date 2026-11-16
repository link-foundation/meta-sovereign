/** Browser callbacks never inspect credential values, cookies or arbitrary HTML. */
export const linkedinExperienceGate = () => {
  const { document, location } = globalThis;
  const visible = (node) => Boolean(node?.getClientRects().length);
  const any = (selector) =>
    [...document.querySelectorAll(selector)].some(visible);
  return {
    url: location.href,
    wall:
      /\/(?:login|uas|authwall|signup|checkpoint)(?:\/|$)/u.test(
        location.pathname
      ) ||
      any(
        'form[action*="login"], input[type="password"], input[name="session_key"], [data-test-id="authwall"]'
      ),
    draft: any(
      'dialog[open], [role="dialog"], main form textarea, main [contenteditable="true"]'
    ),
    ready: any('main'),
  };
};

/** Only rendered entity content enters parsing; raw text stays private evidence. */
export const readLinkedinExperienceDocument = () => {
  const { document, location } = globalThis;
  if (
    [
      ...document.querySelectorAll(
        'input[type="password"], input[name="session_key"], dialog[open], [role="dialog"]'
      ),
    ].some((node) => node.getClientRects().length)
  ) {
    return { blocked: true };
  }
  const main = document.querySelector('main');
  const text = (node) => {
    if (!node) {
      return '';
    }
    const copy = node.cloneNode(true);
    for (const hidden of copy.querySelectorAll(
      '.visually-hidden, .sr-only, script, style'
    )) {
      hidden.remove();
    }
    for (const br of copy.querySelectorAll('br')) {
      br.replaceWith('\n');
    }
    return copy.textContent.replace(/\r/gu, '').trim();
  };
  const entity = '.pvs-entity';
  const own = (root, selector) =>
    [...root.querySelectorAll(selector)].filter(
      (node) => node.closest(entity) === root
    );
  const first = (root, selector) => text(own(root, selector)[0]);
  const read = (root) => ({
    id:
      root.getAttribute('data-entity-urn') ??
      root.getAttribute('data-view-name') ??
      '',
    title: first(root, '.t-bold span[aria-hidden="true"], .t-bold'),
    lines: own(
      root,
      '.t-14.t-normal span[aria-hidden="true"], .pvs-entity__caption-wrapper span[aria-hidden="true"]'
    )
      .map(text)
      .filter(Boolean),
    period: first(root, '.pvs-entity__caption-wrapper'),
    descriptions: own(
      root,
      '.inline-show-more-text, .pv-shared-text-with-see-more'
    )
      .filter(
        (node, index, nodes) =>
          !nodes.some((other, j) => j !== index && other.contains(node))
      )
      .map(text)
      .filter(Boolean),
    marks: [...root.querySelectorAll('a[href]')]
      .filter(
        (node) =>
          node.closest(entity) === root ||
          !node.closest(entity)?.querySelector('.pvs-entity__caption-wrapper')
      )
      .map((node) => ({ text: text(node), href: node.href })),
    text: text(root),
  });
  const roots = [
    ...(main?.querySelectorAll('.pvs-list__paged-list-item') ?? []),
  ].filter(
    (node) =>
      node.getClientRects().length &&
      !node.parentElement?.closest('.pvs-list__paged-list-item')
  );
  const items = roots.map((card) => {
    const root = card.matches(entity) ? card : card.querySelector(entity);
    if (!root) {
      return { unparsed: true, text: text(card) };
    }
    const children = [...root.querySelectorAll(entity)].filter((node) =>
      /(?:19|20)\d{2}/u.test(first(node, '.pvs-entity__caption-wrapper'))
    );
    return { parent: read(root), roles: children.map(read) };
  });
  const visible = (node) => Boolean(node.getClientRects().length);
  const more = [...(main?.querySelectorAll('button') ?? [])]
    .filter(visible)
    .filter((node) =>
      /^(?:show more results|показать (?:ещё|еще) результаты)$/iu.test(
        node.innerText.trim()
      )
    );
  const scroll = document.scrollingElement;
  return {
    url: location.href,
    language: document.documentElement.lang,
    text: text(main),
    items,
    more: more.length,
    collapsed: [...(main?.querySelectorAll('button') ?? [])].filter(
      (node) =>
        visible(node) &&
        /^(?:…?\s*see more|show more|…?\s*см\. далее|показать полностью)$/iu.test(
          node.innerText.trim()
        )
    ).length,
    busy: Boolean(main?.querySelector('[aria-busy="true"], .artdeco-loader')),
    bottom: Boolean(
      scroll &&
      scroll.scrollTop + globalThis.innerHeight >= scroll.scrollHeight - 4
    ),
    empty: Boolean(
      main?.querySelector('[data-view-name="profile-empty-section"]')
    ),
  };
};

/** The only native actions: expand rendered prose/results and scroll the owned page. */
export const advanceLinkedinExperience = ({
  results = false,
  scroll = false,
  url,
} = {}) => {
  const { document } = globalThis;
  if (
    globalThis.location.href !== url ||
    [
      ...document.querySelectorAll(
        'input[type="password"], input[name="session_key"], dialog[open], [role="dialog"]'
      ),
    ].some((node) => node.getClientRects().length)
  ) {
    return { ambiguous: true, clicked: 0 };
  }
  const main = document.querySelector('main');
  if (!main) {
    return { ambiguous: true, clicked: 0 };
  }
  const visible = (node) => Boolean(node.getClientRects().length);
  const buttons = [...main.querySelectorAll('button')].filter(visible);
  const label = results
    ? /^(?:show more results|показать (?:ещё|еще) результаты)$/iu
    : /^(?:…?\s*see more|show more|…?\s*см\. далее|показать полностью)$/iu;
  const candidates = buttons.filter(
    (node) => label.test(node.innerText.trim()) && !node.disabled
  );
  if (results && candidates.length > 1) {
    return { ambiguous: true, clicked: 0 };
  }
  if (candidates.length > 200) {
    return { ambiguous: true, clicked: 0 };
  }
  for (const node of candidates) {
    node.click();
  }
  if (results || scroll) {
    globalThis.scrollBy(
      0,
      Math.max(300, Math.floor(globalThis.innerHeight * 0.8))
    );
  }
  return { ambiguous: false, clicked: candidates.length };
};
