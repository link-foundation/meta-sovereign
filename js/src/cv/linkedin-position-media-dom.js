/** Inspect only the owned position and its native Media steps. */
export const inspectLinkedinPositionMedia = ({ url, token, media, action }) => {
  const { document, location } = globalThis;
  const visible = (node) => Boolean(node?.getClientRects().length);
  const nodes = (parent, selector) =>
    [...parent.querySelectorAll(selector)].filter(visible);
  const label = (node) =>
    (node.getAttribute('aria-label') ?? node.innerText ?? '').trim();
  const dialogs = [
    ...document.querySelectorAll('dialog[open], [role="dialog"]'),
  ];
  const owner = dialogs.find(
    (dialog) => dialog.__metaSovereignPosition === token
  );
  if (location.href !== url || !owner || owner.__metaSovereignPositionEdited) {
    return { state: 'conflict' };
  }
  const buttons = (root, pattern) =>
    nodes(root, 'button').filter(
      (node) =>
        !node.disabled &&
        node.getAttribute('aria-disabled') !== 'true' &&
        pattern.test(label(node))
    );
  const click = (button) => {
    if (!button) {
      return { state: 'unsupported' };
    }
    owner.__metaSovereignPositionApplying = true;
    try {
      const focused = document.activeElement;
      if (
        focused?.matches('input') &&
        button.closest('dialog, [role="dialog"]')?.contains(focused)
      ) {
        focused.blur();
      }
      if (!button.isConnected || button.disabled || !visible(button)) {
        return { state: 'unsupported' };
      }
      button.click();
    } finally {
      owner.__metaSovereignPositionApplying = false;
    }
    return { state: 'clicked' };
  };
  const mediaHeading =
    /^(?:add media|add a link|add link|link preview|edit media|добавить медиа\p{L}*|добавить ссылку|предпросмотр ссылки|изменить медиа\p{L}*)$/iu;
  const heading = (root, pattern) =>
    nodes(root, 'h1, h2, h3, [role="heading"]').some(
      (node) =>
        node.closest('dialog, [role="dialog"]') === root &&
        pattern.test(label(node))
    );
  const previews = dialogs.filter(
    (dialog) =>
      dialog !== owner && visible(dialog) && heading(dialog, mediaHeading)
  );
  const overlaid = dialogs.some(
    (dialog) =>
      visible(dialog) && dialog !== owner && !previews.includes(dialog)
  );
  if (previews.length > 1 || overlaid) {
    return { state: 'conflict' };
  }
  const link = (element) => {
    try {
      const target = new URL(
        element.getAttribute('data-media-url') ?? element.href
      );
      if (
        target.origin === location.origin &&
        target.pathname === '/redir/redirect'
      ) {
        return new URL(target.searchParams.get('url')).href;
      }
      return target.href;
    } catch {
      return null;
    }
  };
  const readCollection = () => {
    const collections = nodes(
      owner,
      'fieldset, section, [data-testid$="position-mediaUiCollection"]'
    ).filter(
      (node) =>
        node.matches('[data-testid$="position-mediaUiCollection"]') ||
        nodes(node, ':scope > :is(h2, h3, h4, legend)').some((item) =>
          /^(?:media|медиа\p{L}*)$/iu.test(label(item))
        )
    );
    const collection = collections.find((node) =>
      collections.every((other) => node.contains(other))
    );
    if (!collection) {
      return { state: 'unsupported' };
    }
    const entries = nodes(collection, '[data-media-url], a[href]').filter(
      (node) => !node.closest('[role="menu"], [role="menuitem"]')
    );
    const editPrefix = /^(?:edit media|изменить медиа\p{L}*),\s*/iu;
    const titleOf = (item) =>
      item.getAttribute('data-media-title') ??
      label(item).replace(editPrefix, '');
    const existing = entries.filter((item) => link(item) === media.url);
    const exact = existing.length === 1 && titleOf(existing[0]) === media.title;
    if (media.previousTitle && !exact) {
      const profile = location.pathname.split(
        /\/(?:edit\/forms\/position|add-edit\/POSITION)\//u
      )[0];
      const nativeEdits = entries.filter(
        (item) =>
          item.matches('a[href]') &&
          item.origin === location.origin &&
          item.pathname.startsWith(`${profile}/`) &&
          editPrefix.test(label(item))
      );
      const edit = nativeEdits.filter(
        (item) => titleOf(item) === media.previousTitle
      );
      if (
        action.kind === 'confirm' &&
        !existing.length &&
        !edit.length &&
        nativeEdits.filter((item) => titleOf(item) === media.title).length === 1
      ) {
        return { state: 'present', exactTitle: true };
      }
      const candidate = edit[0];
      if (
        edit.length !== 1 ||
        existing.length > 1 ||
        (existing.length === 1 && existing[0] !== candidate)
      ) {
        return { state: 'unsupported' };
      }
      // A legacy Edit link may be opaque. The preview must confirm its site before typing.
      return action.kind === 'open-edit'
        ? click(candidate)
        : { state: 'rename' };
    }
    if (existing.length) {
      return { state: 'present', exactTitle: exact };
    }
    const opaque = entries.some((item) => {
      const href = link(item);
      return !href || new URL(href).origin === location.origin;
    });
    if (
      opaque ||
      nodes(
        collection,
        '[aria-label^="Edit media"], [aria-label^="Изменить медиа"]'
      ).length
    ) {
      return { state: 'unsupported' };
    }
    const add = buttons(collection, /^(?:add media|добавить медиа\p{L}*)$/iu);
    if (add.length !== 1 || add[0].type !== 'button') {
      return { state: 'unsupported' };
    }
    const menuId = add[0].getAttribute('aria-controls');
    const controlled = menuId && document.getElementById(menuId);
    const menuRoot =
      controlled && visible(controlled) ? controlled : collection;
    const choices = nodes(menuRoot, '[role="menuitem"]').filter(
      (node) =>
        node.getAttribute('aria-disabled') !== 'true' &&
        /^(?:add a link|добавить ссылку)$/iu.test(label(node))
    );
    if (action.kind === 'open') {
      return click(add[0]);
    }
    if (action.kind === 'choose') {
      return choices.length === 1 ? click(choices[0]) : { state: 'pending' };
    }
    return { state: 'available' };
  };
  const preview = previews[0];
  if (!preview) {
    return visible(owner) ? readCollection() : { state: 'conflict' };
  }

  const inputs = (pattern) =>
    nodes(preview, 'input').filter((node) =>
      [
        label(node),
        node.getAttribute('placeholder') ?? '',
        ...Array.from(node.labels ?? [], label),
      ].some((value) => pattern.test(value.replace(/\s*\*$/u, '')))
    );
  const titles = inputs(/^(?:title|название)$/iu);
  const urls = inputs(
    /^(?:paste or type a link|url|вставьте или введите ссылку|ссылка)(?:\s|$)/iu
  );
  const type = (input) => {
    if (
      !input ||
      input.disabled ||
      input.readOnly ||
      input.value !== action.expected
    ) {
      return { state: 'conflict' };
    }
    owner.__metaSovereignPositionApplying = true;
    try {
      input.focus();
      const from = action.replace ? 0 : input.value.length;
      input.setSelectionRange(from, input.value.length);
      const changed = document.execCommand(
        'insertText',
        false,
        action.character
      );
      return { state: changed ? 'typed' : 'unsupported', value: input.value };
    } finally {
      owner.__metaSovereignPositionApplying = false;
    }
  };
  if (titles.length === 1) {
    const sameLink =
      nodes(preview, '[data-media-url], a[href]').some(
        (item) => link(item) === media.url
      ) ||
      (urls.length === 1 && urls[0].value === media.url);
    if (!sameLink) {
      return { state: 'pending' };
    }
    if (action.kind === 'type-title') {
      return type(titles[0]);
    }
    if (action.kind === 'attach') {
      const matches = buttons(preview, /^(?:save|сохранить)$/iu).filter(
        (node) => !node.form || preview.contains(node.form)
      );
      return titles[0].value === media.title && matches.length === 1
        ? click(matches[0])
        : { state: 'unsupported' };
    }
    return { state: 'preview', value: titles[0].value };
  }
  if (urls.length !== 1) {
    return { state: 'pending' };
  }
  if (action.kind === 'type-url') {
    return type(urls[0]);
  }
  if (action.kind === 'preview') {
    const matches = buttons(preview, /^(?:add|добавить)$/iu).filter(
      (node) => !node.form || preview.contains(node.form)
    );
    return urls[0].value === media.url && matches.length === 1
      ? click(matches[0])
      : { state: 'pending' };
  }
  return { state: 'url', value: urls[0].value };
};
