/** Operate on the About control opened by the current review, in one evaluation. */
export const inspectLinkedinAboutForm = ({
  url,
  token,
  expected,
  action,
  operation,
}) => {
  const { document, location, HTMLTextAreaElement, Event } = globalThis;
  const visible = (node) =>
    Boolean(node.getClientRects().length) &&
    globalThis.getComputedStyle(node).visibility === 'visible';
  const onPage = (root, selector) =>
    [...root.querySelectorAll(selector)].filter(visible);
  const label = (node) =>
    (node.getAttribute('aria-label') ?? node.textContent).trim();
  const enabled = (node) =>
    !node.disabled && node.getAttribute('aria-disabled') !== 'true';
  const owns = (row, dialog, field) =>
    row?.token === token && row.dialog === dialog && row.field === field;
  if (location.href !== url) {
    return { state: 'navigating' };
  }
  if (
    onPage(
      document,
      'input[type="password"], input[name="session_key"], [data-test-id="authwall"]'
    ).length
  ) {
    return { state: 'unavailable' };
  }
  const owned = document.__metaSovereignAboutReview;
  const dialogs = onPage(document, 'dialog[open], [role="dialog"]');
  if (action?.kind === 'discard') {
    if (owned?.token !== token || owned.issued !== 'skip' || owned.changed) {
      return { state: 'unavailable' };
    }
    const warnings = dialogs.filter((dialog) =>
      onPage(dialog, 'h1, h2, h3, [role="heading"]').some((heading) =>
        /^(?:discard changes|отклонить изменения|отменить изменения)\??$/iu.test(
          label(heading)
        )
      )
    );
    const buttons =
      warnings.length === 1 &&
      dialogs.every(
        (dialog) => dialog === owned.dialog || dialog === warnings[0]
      )
        ? onPage(warnings[0], 'button').filter(
            (node) =>
              enabled(node) &&
              node.type === 'button' &&
              /^(?:discard|отменить|отклонить|не сохранять)$/iu.test(
                label(node)
              )
          )
        : [];
    if (buttons.length !== 1 || owned.discarded) {
      return { state: 'unavailable' };
    }
    owned.discarded = true;
    buttons[0].click();
    return { state: 'dispatched' };
  }
  const [dialog] = dialogs;
  if (dialogs.length !== 1) {
    return {
      state: dialogs.length ? 'ambiguous' : 'missing',
      issued: owned?.token === token ? owned.issued : null,
    };
  }
  const aboutHeading =
    /^(?:edit (?:about|summary)|(?:редактировать|изменить) (?:раздел )?(?:«о себе»|о себе|общие сведения))$/iu;
  const addHeading =
    /^(?:add (?:about|summary)|добавить (?:раздел )?(?:«о себе»|о себе|общие сведения))$/iu;
  const isAbout = (name) =>
    aboutHeading.test(name) || (operation === 'add' && addHeading.test(name));
  const headings = onPage(dialog, 'h1, h2, h3, [role="heading"]');
  const fields = onPage(dialog, 'textarea, [contenteditable="true"]');
  const [field] = fields;
  if (
    !(
      isAbout(dialog.getAttribute('aria-label')?.trim() ?? '') ||
      headings.some((heading) => isAbout(label(heading)))
    ) ||
    fields.length !== 1 ||
    !(field instanceof HTMLTextAreaElement) ||
    !enabled(field) ||
    field.readOnly ||
    field.value.length > 24000
  ) {
    return { state: 'unavailable' };
  }
  const save = /^(?:save|сохранить)$/iu;
  const cancel = /^(?:cancel|отмена|отменить)$/iu;
  const dismiss = /^(?:dismiss|close|закрыть)$/iu;
  const controls = (pattern) =>
    onPage(dialog, 'button').filter(
      (button) => enabled(button) && pattern.test(label(button))
    );
  const same = owns(owned, dialog, field);
  const otherFields = () =>
    JSON.stringify(
      onPage(
        dialog,
        'input:not([type="hidden"]), select, [role="switch"], [aria-pressed], [aria-selected]'
      ).map((node) => [
        node.id,
        node.name,
        node.value,
        node.checked,
        node.getAttribute('aria-checked'),
        node.getAttribute('aria-pressed'),
        node.getAttribute('aria-selected'),
      ])
    );
  if (!action) {
    return {
      state: 'ready',
      value: field.value,
      limit: field.maxLength,
      owned: same,
      changed: same && (owned.changed || owned.otherFields !== otherFields()),
      issued: same ? owned.issued : null,
    };
  }
  if (field.value !== expected) {
    return { state: 'conflict' };
  }
  if (action.kind === 'prepare') {
    const value = action.value;
    if (
      owned?.dialog?.isConnected ||
      !value.trim() ||
      value.length > 24000 ||
      (field.maxLength >= 0 && value.length > field.maxLength)
    ) {
      return { state: 'conflict' };
    }
    const row = {
      token,
      dialog,
      field,
      changed: false,
      issued: null,
      otherFields: otherFields(),
    };
    document.__metaSovereignAboutReview = row;
    const edited = (event) => {
      if (event.isTrusted) {
        row.changed = true;
      }
    };
    dialog.addEventListener('input', edited, true);
    dialog.addEventListener('change', edited, true);
    dialog.addEventListener(
      'click',
      (event) => {
        const button = event.target.closest?.('button');
        if (!event.isTrusted || !button || !dialog.contains(button)) {
          return;
        }
        if (
          save.test(label(button)) &&
          controls(save).length === 1 &&
          enabled(button) &&
          !row.changed &&
          !row.issued &&
          field.isConnected &&
          row.otherFields === otherFields() &&
          field.value === value
        ) {
          row.issued = 'browser';
        } else {
          row.changed = true;
        }
      },
      true
    );
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    ).set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return { state: 'prepared' };
  }
  if (
    !same ||
    owned.changed ||
    owned.issued ||
    owned.otherFields !== otherFields()
  ) {
    return { state: 'conflict' };
  }
  const cancelButtons = controls(cancel);
  const buttons =
    action.kind === 'save'
      ? controls(save)
      : cancelButtons.length
        ? cancelButtons
        : controls(dismiss);
  if (
    buttons.length !== 1 ||
    (action.kind === 'skip' && buttons[0].type !== 'button')
  ) {
    return { state: 'unavailable' };
  }
  owned.issued = action.kind;
  buttons[0].click();
  return { state: 'dispatched' };
};
