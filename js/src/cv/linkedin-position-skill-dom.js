/** Read only requested names from the owning profile's Skills page. */
export const observedLinkedinProfileSkills = ({ url, names }) => {
  const { document, location } = globalThis;
  if (location.href !== url) {
    return null;
  }
  const visible = (node) => Boolean(node.getClientRects().length);
  const text = (node) => (node.innerText ?? node.textContent).trim();
  const key = (name) => name.normalize('NFKC').trim().toLowerCase();
  const mains = [...document.querySelectorAll('main')].filter(visible);
  if (mains.length !== 1) {
    return null;
  }
  const main = mains[0];
  const heading = [...main.querySelectorAll('h1, h2, [role="heading"]')]
    .filter(visible)
    .some((node) => /^(?:skills|навыки)$/iu.test(text(node)));
  if (!heading) {
    return null;
  }
  const cards = [
    ...main.querySelectorAll(
      'li.pvs-list__paged-list-item, [data-view-name="profile-component-entity"]'
    ),
  ]
    .filter(visible)
    .slice(0, 200);
  const labels = new Set();
  for (const card of cards) {
    const label = card.querySelector('.t-bold [aria-hidden="true"], h3, h4');
    if (label && visible(label)) {
      labels.add(key(text(label)));
    }
  }
  const observed = names.filter((name) => labels.has(key(name)));
  if (observed.length !== names.length) {
    globalThis.scrollBy(0, Math.max(400, globalThis.innerHeight * 0.8));
  }
  return observed;
};

/** Change only an exact choice in the owned position's skill picker. */
export const inspectLinkedinPositionSkills = ({ url, token, name, action }) => {
  const { document, location, Event, HTMLInputElement } = globalThis;
  const visible = (node) => Boolean(node.getClientRects().length);
  const label = (node) =>
    (node.getAttribute('aria-label') ?? node.innerText ?? '').trim();
  const key = (value) => value.normalize('NFKC').trim().toLowerCase();
  const select = (parent, selector) =>
    [...parent.querySelectorAll(selector)].filter(visible);
  const dialogs = select(document, 'dialog[open], [role="dialog"]');
  const dialog = dialogs[0];
  const owned = () =>
    location.href === url &&
    dialogs.length === 1 &&
    dialog.__metaSovereignPosition === token &&
    !dialog.__metaSovereignPositionEdited;
  if (!owned()) {
    return 'conflict';
  }
  const sections = select(
    dialog,
    'fieldset, section, [data-testid$="position-skillsUiCollection"]'
  ).filter(
    (node) =>
      node.matches('[data-testid$="position-skillsUiCollection"]') ||
      /^(?:skills|навыки)$/iu.test(
        label(node.querySelector(':scope > :is(legend, h2, h3, h4)') ?? node)
      )
  );
  const section = sections.find((node) =>
    sections.every((other) => node.contains(other) || other.contains(node))
  );
  const click = (node) => {
    dialog.__metaSovereignPositionApplying = true;
    try {
      node.click();
    } finally {
      dialog.__metaSovereignPositionApplying = false;
    }
  };
  const isSelected = (root) =>
    select(
      root,
      'input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"]'
    ).some((node) =>
      [label(node), ...Array.from(node.labels ?? [], label)].some(
        (text) => key(text) === key(name)
      )
    );
  if (action === 'read') {
    // LinkedIn renders checked skill chips as labelled checkboxes.
    return isSelected(section ?? dialog) ? 'selected' : 'missing';
  }

  const inputs = select(
    section ?? dialog,
    'input[type="text"], input[type="search"], input:not([type])'
  ).filter((node) =>
    /^(?:skills?\b|навык(?:и|а)?(?:\s|$))/iu.test(
      node.getAttribute('placeholder') ||
        label(node) ||
        label(node.labels?.[0] ?? node)
    )
  );
  const input = inputs[0];
  const openPicker = () => {
    if (inputs.length === 1) {
      return input.value === '' ? 'opened' : 'conflict';
    }
    if (inputs.length) {
      return 'unsupported';
    }
    const buttons = select(section ?? dialog, 'button[type="button"]').filter(
      (node) =>
        !node.disabled && /^(?:add skill|добавить навык)$/iu.test(label(node))
    );
    if (buttons.length !== 1) {
      return 'unsupported';
    }
    click(buttons[0]);
    return 'opened';
  };
  if (action === 'open') {
    return openPicker();
  }
  if (inputs.length !== 1 || input.disabled || input.readOnly) {
    return 'unsupported';
  }
  const write = (value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    ).set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  if (action === 'enter') {
    if (input.value !== '') {
      return 'conflict';
    }
    write(name);
    return 'typed';
  }
  if (key(input.value) !== key(name)) {
    return 'conflict';
  }
  if (action === 'clear') {
    write('');
    return 'cleared';
  }
  const choose = () => {
    const coupled = input.getAttribute('aria-controls');
    const lists = coupled
      ? [document.getElementById(coupled)].filter(
          (node) =>
            node && visible(node) && node.getAttribute('role') === 'listbox'
        )
      : select(section ?? dialog, '[role="listbox"]');
    if (lists.length !== 1) {
      return lists.length ? 'unsupported' : 'pending';
    }
    const options = select(lists[0], '[role="option"]').filter(
      (node) =>
        node.getAttribute('aria-disabled') !== 'true' &&
        key(label(node)) === key(name)
    );
    if (options.length !== 1) {
      return options.length ? 'unsupported' : 'pending';
    }
    click(options[0]);
    return 'chosen';
  };
  return choose();
};
