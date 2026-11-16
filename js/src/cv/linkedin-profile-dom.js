/** Read and expand only the selected About section, without field values. */
export const scanLinkedinProfileAbout = ({
  url,
  expand = false,
  scroll = false,
}) => {
  const { document, location } = globalThis;
  const visible = (node) => Boolean(node.getClientRects().length);
  if (
    location.href !== url ||
    [
      ...document.querySelectorAll(
        'input[type="password"], input[name="session_key"], dialog[open], [role="dialog"], main form textarea, main [contenteditable="true"]'
      ),
    ].some(visible)
  ) {
    return { blocked: true };
  }
  const main = document.querySelector('main');
  const sections = [...(main?.querySelectorAll('[id="about"]') ?? [])]
    .map((anchor) => anchor.closest('section'))
    .filter((section) => section && visible(section));
  if (!main || sections.length > 1) {
    return { blocked: true };
  }
  const readSection = (section) => {
    if (!section) {
      return { observed: false, reason: 'section-not-rendered', more: 0 };
    }
    const parts = [
      ...section.querySelectorAll(
        '.inline-show-more-text, .pv-shared-text-with-see-more'
      ),
    ].filter(
      (part, index, all) =>
        !all.some((other, j) => j !== index && other.contains(part))
    );
    const more = [...section.querySelectorAll('button')].filter(
      (button) =>
        visible(button) &&
        /^(?:…?\s*see more|show more|…?\s*см\. далее|показать полностью)$/iu.test(
          button.innerText.trim()
        )
    );
    if (
      parts.length !== 1 ||
      more.length > 1 ||
      more.some((button) => button.disabled)
    ) {
      return { blocked: true };
    }
    const copy = parts[0].cloneNode(true);
    copy
      .querySelectorAll(
        'script, style, button, .visually-hidden, .sr-only, [hidden]'
      )
      .forEach((node) => node.remove());
    copy.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
    copy.querySelectorAll('p, div').forEach((node) => node.append('\n'));
    const about = copy.textContent.replace(/\r/gu, '').trim();
    if (about.length > 24000) {
      return { blocked: true };
    }
    if (expand && more.length) {
      more[0].click();
    }
    return { observed: true, about, more: more.length };
  };
  const section = sections[0];
  const data = readSection(section);
  const atBottom = () => {
    const element = document.scrollingElement;
    return Boolean(
      element &&
      element.scrollTop + globalThis.innerHeight >= element.scrollHeight - 4
    );
  };
  const bottom = atBottom();
  if (scroll && !section) {
    globalThis.scrollBy(
      0,
      Math.max(300, Math.floor(globalThis.innerHeight * 0.8))
    );
  }
  return {
    url: location.href,
    ...data,
    busy: Boolean(main.querySelector('[aria-busy="true"], .artdeco-loader')),
    bottom,
  };
};
