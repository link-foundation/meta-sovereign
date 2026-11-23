export const linkedinPositionLabels = {
  title: [/^(?:job title|title|должность)$/iu, 'text'],
  company: [
    /^(?:company(?: name)?|organization(?: name)?|компания|организация)$/iu,
    'text',
  ],
  location: [/^(?:location|местоположение|местонахождение)$/iu, 'text'],
  description: [/^(?:description|описание)(?:$|[,:]\s)/iu, 'text'],
  current: [
    /^(?:i am currently working in this role|я (?:в настоящее время|сейчас) работаю(?: в этой должности)?|по настоящее время)$/iu,
    'check',
  ],
  startMonth: [/^(?:start month|месяц начала)$/iu, 'select'],
  startYear: [/^(?:start year|год начала)$/iu, 'select'],
  endMonth: [/^(?:end month|месяц окончания)$/iu, 'select'],
  endYear: [/^(?:end year|год окончания)$/iu, 'select'],
  notify: [
    /^(?:notify (?:your )?network|уведомить(?: мою)? сеть|уведомить контакты)$/iu,
    'check',
  ],
};

/** A serialized browser callback constrained to one recognized position dialog. */
export const inspectLinkedinPositionForm = ({
  url,
  token,
  fields,
  expected,
  action,
}) => {
  const {
    document,
    location,
    HTMLInputElement,
    HTMLTextAreaElement,
    HTMLSelectElement,
    Event,
  } = globalThis;
  const onScreen = (node) => Boolean(node.getClientRects().length);
  if (
    location.href !== url ||
    [
      ...document.querySelectorAll(
        'input[type="password"], input[name="session_key"], [data-test-id="authwall"]'
      ),
    ].some(onScreen)
  ) {
    return { state: 'unavailable' };
  }
  const dialogs = [
    ...document.querySelectorAll('dialog[open], [role="dialog"]'),
  ].filter(onScreen);
  if (dialogs.length !== 1) {
    return { state: dialogs.length ? 'ambiguous' : 'missing' };
  }
  const dialog = dialogs[0];
  const labelText = (node) => {
    const copy = node?.cloneNode(true);
    copy
      ?.querySelectorAll('input, textarea, select, button')
      .forEach((child) => child.remove());
    return copy?.textContent ?? '';
  };
  const label = (node) => {
    const referred = (node.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/u)
      .map((id) => labelText(document.getElementById(id)))
      .join(' ');
    const labels = Array.from(node.labels ?? [], labelText).join(' ');
    return (node.getAttribute('aria-label') || referred.trim() || labels || '')
      .replace(/\s+/gu, ' ')
      .replace(/\s*\*\s*$/u, '')
      .trim();
  };
  const controls = [
    ...dialog.querySelectorAll(
      'input, textarea, select, [contenteditable="true"], [role="switch"]'
    ),
  ].filter(onScreen);
  if (controls.length > 100) {
    return { state: 'ambiguous' };
  }
  const accepts = (node, kind) => {
    if (kind === 'select') {
      return node instanceof HTMLSelectElement;
    }
    if (kind === 'check') {
      return (
        (node instanceof HTMLInputElement && node.type === 'checkbox') ||
        (node.getAttribute('role') === 'switch' &&
          /^(true|false)$/u.test(node.getAttribute('aria-checked') ?? ''))
      );
    }
    return (
      (node instanceof HTMLInputElement &&
        ['text', 'search'].includes(node.type)) ||
      node instanceof HTMLTextAreaElement ||
      node.isContentEditable
    );
  };
  const records = {};
  const labels = controls.map((node) => [node, label(node)]);
  for (const [name, [pattern, kind]] of Object.entries(fields)) {
    const matches = labels.filter(([, text]) => pattern.test(text));
    const node = matches[0]?.[0];
    if (matches.length > 1 || (node && !accepts(node, kind))) {
      return { state: 'ambiguous' };
    }
    if (node) {
      records[name] = { node, kind };
    }
  }
  if (
    ['title', 'company', 'current', 'startYear'].some((name) => !records[name])
  ) {
    return { state: 'missing' };
  }
  const read = ({ node, kind }) => {
    const editable =
      !node.disabled &&
      !node.readOnly &&
      node.getAttribute('aria-disabled') !== 'true';
    if (kind === 'select') {
      return {
        editable,
        value: node.value,
        options: Array.from(node.options, (option) => ({
          label: option.textContent.trim(),
          value: option.value,
          disabled: option.disabled,
        })).slice(0, 250),
      };
    }
    return {
      editable,
      value:
        kind === 'check'
          ? (node.checked ?? node.getAttribute('aria-checked') === 'true')
          : (node.value ?? node.innerText.replace(/\r/gu, '')),
      ...(kind === 'text' && { maxLength: node.maxLength ?? -1 }),
    };
  };
  const result = Object.fromEntries(
    Object.entries(records).map(([name, record]) => [name, read(record)])
  );
  if (
    Object.values(result).some(
      (entry) => typeof entry.value === 'string' && entry.value.length > 24000
    )
  ) {
    return { state: 'unavailable' };
  }
  if (!action) {
    return {
      state: 'ready',
      owned: dialog.__metaSovereignPosition === token,
      ownerChanged: dialog.__metaSovereignPositionEdited === true,
      controls: result,
    };
  }
  if (JSON.stringify(result) !== JSON.stringify(expected)) {
    return { state: 'conflict' };
  }
  if (action.kind === 'adopt' && !dialog.__metaSovereignPosition) {
    dialog.__metaSovereignPosition = token;
    const recordOwnerEdit = (event) => {
      if (event.isTrusted && !dialog.__metaSovereignPositionApplying) {
        dialog.__metaSovereignPositionEdited = true;
      }
    };
    dialog.addEventListener('input', recordOwnerEdit, true);
    dialog.addEventListener('change', recordOwnerEdit, true);
    return { state: 'adopted' };
  }
  if (
    dialog.__metaSovereignPosition !== token ||
    dialog.__metaSovereignPositionEdited
  ) {
    return { state: 'conflict' };
  }
  if (action.kind === 'save' || action.kind === 'skip') {
    const text =
      action.kind === 'save'
        ? /^(?:save|сохранить)$/iu
        : /^(?:cancel|отмена|отменить)$/iu;
    const buttons = [...dialog.querySelectorAll('button')].filter(
      (button) =>
        onScreen(button) &&
        !button.disabled &&
        button.getAttribute('aria-disabled') !== 'true' &&
        text.test(
          (button.getAttribute('aria-label') ?? button.textContent).trim()
        )
    );
    if (
      buttons.length !== 1 ||
      (action.kind === 'skip' && buttons[0].type !== 'button')
    ) {
      return { state: 'unsupported' };
    }
    if (action.kind === 'skip') {
      document.__metaSovereignPositionDiscard = dialog;
    }
    buttons[0].click();
    return { state: 'dispatched' };
  }
  const control = records[action.name];
  if (
    !control ||
    control.kind !== action.kind ||
    !result[action.name].editable
  ) {
    return { state: 'conflict' };
  }
  const { node } = control;
  const { value } = action;
  if (action.kind === 'check') {
    if (typeof value !== 'boolean') {
      return { state: 'unsupported' };
    }
    if (result[action.name].value !== value) {
      dialog.__metaSovereignPositionApplying = true;
      try {
        node.click();
      } finally {
        dialog.__metaSovereignPositionApplying = false;
      }
    }
  } else {
    const limit = result[action.name].maxLength;
    if (
      typeof value !== 'string' ||
      (limit >= 0 && value.length > limit) ||
      (action.kind === 'select' &&
        !result[action.name].options.some(
          (option) => !option.disabled && option.value === value
        ))
    ) {
      return { state: 'unsupported' };
    }
    if (node.isContentEditable) {
      node.innerText = value;
    } else {
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(node),
        'value'
      ).set.call(node, value);
    }
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { state: 'changed' };
};
