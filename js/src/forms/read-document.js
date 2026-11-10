/** Runs inside one browser document. Keep self-contained for commander.evaluate.
 * Helpers stay inside this serializable boundary; each handles one DOM concern.
 */
/* eslint-disable max-lines-per-function -- The page evaluator must serialize its DOM helpers together. */
export const readFormDocument = ({
  maxFields = 200,
  maxOptions = 100,
} = {}) => {
  const doc = globalThis.document;
  const reasons = new Set();
  const groups = new Map();
  const clip = (value) => {
    const text = String(value ?? '')
      .replace(/\s+/gu, ' ')
      .trim();
    if (text.length > 2000) {
      reasons.add('text-limit');
    }
    return text.slice(0, 2000);
  };
  const attr = (node, key) => node.getAttribute(key) ?? '';
  const visible = (node) => {
    if (node.closest('[hidden], [inert], [aria-hidden="true"]')) {
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
  const refs = (node, key) =>
    clip(
      attr(node, key)
        .split(/\s+/u)
        .slice(0, 20)
        .map((id) => doc.getElementById(id)?.textContent ?? '')
        .join(' ')
    );
  const labelText = (label) => {
    const filter = globalThis.NodeFilter;
    const walker = doc.createTreeWalker(
      label,
      filter.SHOW_ELEMENT | filter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (node.nodeType === 1) {
            return node.matches('input,textarea,select,button')
              ? filter.FILTER_REJECT
              : filter.FILTER_SKIP;
          }
          return filter.FILTER_ACCEPT;
        },
      }
    );
    let text = '';
    for (let step = 0; step < 100; step++) {
      const next = walker.nextNode();
      if (!next) {
        return text;
      }
      text += ` ${next.textContent}`;
      if (text.length > 2000) {
        break;
      }
    }
    reasons.add('text-limit');
    return text;
  };
  const named = (node) => {
    const candidates = [
      ['aria-labelledby', refs(node, 'aria-labelledby')],
      ['aria-label', attr(node, 'aria-label')],
      [
        'label',
        Array.from(node.labels ?? [])
          .slice(0, 20)
          .map(labelText)
          .join(' '),
      ],
    ];
    const hit = candidates.find(([, value]) => clip(value));
    return hit ? { text: clip(hit[1]), source: hit[0] } : null;
  };
  const heading = (node) => {
    // Stay within the closest question/section; a heading below a control is
    // not evidence for its question. Bound ancestor and sibling traversal.
    let current = node;
    for (
      let depth = 0;
      current && depth < 6;
      depth++, current = current.parentElement
    ) {
      let sibling = current.previousElementSibling;
      for (
        let step = 0;
        sibling && step < 20;
        step++, sibling = sibling.previousElementSibling
      ) {
        const headings = sibling.matches('h1,h2,h3,h4,h5,h6,[role="heading"]')
          ? [sibling]
          : sibling.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]');
        const found = Array.from(headings).filter(visible).at(-1);
        if (found) {
          return clip(found.textContent);
        }
      }
      if (
        current.matches(
          'fieldset,[role="group"],[role="radiogroup"],section,form'
        )
      ) {
        break;
      }
    }
    return '';
  };
  const groupOf = (node) => {
    const parent = node.parentElement?.closest(
      'fieldset,[role="group"],[role="radiogroup"]'
    );
    if (!parent) {
      return null;
    }
    const name = named(parent);
    const legend = Array.from(parent.children).find(
      (child) => child.tagName === 'LEGEND'
    );
    if (!groups.has(parent)) {
      groups.set(parent, `group-${groups.size + 1}`);
    }
    return {
      id: groups.get(parent),
      label: name?.text || clip(legend?.textContent),
      source: name?.source || (legend ? 'legend' : 'unlabelled'),
    };
  };
  const optionsOf = (node, type) => {
    if (!(
      node.tagName === 'SELECT' || ['listbox', 'combobox'].includes(type)
    )) {
      return [];
    }
    const owned = attr(node, 'aria-controls')
      .split(/\s+/u)
      .slice(0, 10)
      .map((id) => doc.getElementById(id))
      .filter(Boolean);
    const choices = new Set([
      ...node.querySelectorAll('option,[role="option"]'),
      ...owned.flatMap((owner) =>
        Array.from(owner.querySelectorAll('[role="option"]'))
      ),
    ]);
    const options = [];
    for (const option of choices) {
      if (options.length >= maxOptions) {
        reasons.add('option-limit');
        break;
      }
      options.push({
        label: clip(option.label || option.textContent),
        value: clip(
          option.value ?? (attr(option, 'data-value') || option.textContent)
        ),
        selected:
          option.selected === true || attr(option, 'aria-selected') === 'true',
        disabled:
          option.matches(':disabled') ||
          attr(option, 'aria-disabled') === 'true',
      });
    }
    if (type === 'combobox' && options.length === 0) {
      reasons.add('unexpanded-options');
    }
    return options;
  };
  const checkedOf = (node, type) => {
    if (!['checkbox', 'radio'].includes(type)) {
      return null;
    }
    return node.tagName === 'INPUT'
      ? node.checked
      : attr(node, 'aria-checked') === 'true';
  };
  const stateOf = (node, type) => {
    const sensitive = ['password', 'file'].includes(type);
    const value = sensitive
      ? null
      : String(
          node.value ??
            (node.isContentEditable
              ? node.textContent
              : attr(node, 'aria-valuetext'))
        );
    if (value?.length > 10000) {
      reasons.add('value-limit');
    }
    return {
      required:
        node.required === true || attr(node, 'aria-required') === 'true',
      disabled:
        node.matches(':disabled') || attr(node, 'aria-disabled') === 'true',
      readOnly:
        node.readOnly === true || attr(node, 'aria-readonly') === 'true',
      value: value?.slice(0, 10000) ?? null,
      checked: checkedOf(node, type),
      valueOmitted: sensitive ? type : null,
      multiple:
        node.multiple === true || attr(node, 'aria-multiselectable') === 'true',
      indeterminate:
        node.indeterminate === true || attr(node, 'aria-checked') === 'mixed',
    };
  };
  const readField = (node, type) => {
    const group = groupOf(node);
    const nearbyHeading = heading(node);
    const fallbacks = [
      ['placeholder', attr(node, 'placeholder')],
      ['title', attr(node, 'title')],
      ['legend', group?.source === 'legend' ? group.label : ''],
      ['heading', nearbyHeading],
    ];
    const fallback = fallbacks.find(([, value]) => clip(value));
    const label = named(node) ?? {
      text: clip(fallback?.[1]),
      source: fallback?.[0] ?? 'unlabelled',
    };
    if (!label.text) {
      reasons.add('unlabelled-controls');
    }
    return {
      tag: node.tagName.toLowerCase(),
      type,
      name: clip(node.name),
      nativeId: clip(node.id),
      label: label.text,
      labelSource: label.source,
      group,
      heading: nearbyHeading,
      description: refs(node, 'aria-describedby'),
      ...stateOf(node, type),
      options: optionsOf(node, type),
    };
  };
  const typeOf = (node) =>
    node.tagName === 'INPUT'
      ? String(node.type).toLowerCase()
      : attr(node, 'role') ||
        (node.isContentEditable
          ? 'contenteditable'
          : node.tagName.toLowerCase());
  const selector =
    'input,textarea,select,[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="listbox"],[contenteditable="true"]';
  const fields = [];
  let examined = 0;
  let excluded = 0;
  for (const node of doc.querySelectorAll(selector)) {
    if (++examined > 2000) {
      reasons.add('control-scan-limit');
      break;
    }
    const tag = node.tagName.toLowerCase();
    const type = typeOf(node);
    if (
      ['hidden', 'submit', 'reset', 'button', 'image'].includes(type) ||
      !visible(node)
    ) {
      excluded++;
      continue;
    }
    // ARIA wrappers around native inputs are represented by their actual controls.
    if (
      !['input', 'textarea', 'select'].includes(tag) &&
      node.querySelector('input,textarea,select')
    ) {
      continue;
    }
    if (fields.length >= maxFields) {
      reasons.add('field-limit');
      break;
    }
    fields.push({
      id: `field-${fields.length + 1}`,
      index: examined - 1,
      ...readField(node, type),
    });
  }
  // Shadow DOM needs its own reader. Never represent an opaque custom element
  // as proof that the entire questionnaire was inspected.
  let nodes = 0;
  for (const node of doc.querySelectorAll('*')) {
    if (++nodes > 5000) {
      reasons.add('shadow-scan-limit');
      break;
    }
    if (node.shadowRoot || node.tagName.includes('-')) {
      reasons.add('custom-elements');
    }
  }
  return {
    url: doc.location.href,
    documentTime: globalThis.performance.timeOrigin,
    title: clip(doc.title),
    fields,
    excluded,
    reasons: [...reasons],
    scope: 'visible-current-document',
  };
};

/* eslint-enable max-lines-per-function */

export const formDocumentIdentity = () => ({
  url: globalThis.document.location.href,
  documentTime: globalThis.performance.timeOrigin,
});

export const formFrameVisible = (node) => {
  if (node.closest('[hidden],[inert],[aria-hidden="true"]')) {
    return false;
  }
  const style = globalThis.getComputedStyle(node);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    node.getClientRects().length > 0
  );
};
