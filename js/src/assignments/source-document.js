/** Serialized into an owned page: visible instruction text, never form values. */
export const readAssignmentSourceDocument = () => {
  const doc = globalThis.document;
  const excluded =
    'script,style,noscript,input,textarea,select,button,output,[contenteditable],[role="textbox"],[role="combobox"],.smart-captcha,[data-smartcaptcha],.g-recaptcha,.h-captcha,.cf-turnstile';
  const visible = (node) => {
    if (node.closest('[hidden],[inert],[aria-hidden="true"]')) {
      return false;
    }
    const style = globalThis.getComputedStyle(node);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      node.getClientRects().length > 0
    );
  };
  const blocked =
    Boolean(
      doc.querySelector(
        'input[type="password"],.smart-captcha,[data-smartcaptcha],.g-recaptcha,.h-captcha,.cf-turnstile'
      )
    ) ||
    /\/(?:signin|login|challenge)(?:\/|$)/iu.test(globalThis.location.pathname);
  const supported =
    ['text/html', 'text/plain', 'application/xhtml+xml'].includes(
      doc.contentType
    ) && !doc.querySelector('canvas,embed,object,iframe');
  const root =
    doc.querySelector('article,[role="document"],main,pre') ?? doc.body;
  const result = {
    url: globalThis.location.href,
    title: doc.title,
    text: '',
    complete: supported && !blocked && Boolean(root),
    blocked,
    scope: 'visible-document-text',
  };
  if (!result.complete) {
    return result;
  }
  const filter = globalThis.NodeFilter;
  const walker = doc.createTreeWalker(
    root,
    filter.SHOW_ELEMENT | filter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node.nodeType === 1) {
          return node.matches(excluded) || !visible(node)
            ? filter.FILTER_REJECT
            : filter.FILTER_ACCEPT;
        }
        return node.parentElement &&
          visible(node.parentElement) &&
          !node.parentElement.closest(excluded)
          ? filter.FILTER_ACCEPT
          : filter.FILTER_REJECT;
      },
    }
  );
  const chunks = [];
  let length = 0;
  let count = 0;
  let visited = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (++visited > 10000) {
      result.complete = false;
      break;
    }
    if (node.nodeType === 1) {
      continue;
    }
    if (++count > 2500) {
      result.complete = false;
      break;
    }
    const value = node.textContent.trim();
    if (!value) {
      continue;
    }
    length += value.length + 1;
    if (length > 30000) {
      result.complete = false;
      break;
    }
    chunks.push(value);
  }
  result.text = chunks.join('\n');
  return result;
};
