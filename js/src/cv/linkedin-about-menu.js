/** Inspect only the owner's profile-section menu and its About action. */
export const inspectLinkedinAboutMenu = ({ profile, action, expected }) => {
  const { document, location } = globalThis;
  const matches = (root, selector) =>
    [...root.querySelectorAll(selector)].filter(
      (node) =>
        node.getClientRects().length &&
        globalThis.getComputedStyle(node).visibility === 'visible'
    );
  const label = (node) =>
    (node.getAttribute('aria-label') ?? node.innerText).trim();
  const available = (node) =>
    !node.disabled &&
    node.getAttribute('aria-disabled') !== 'true' &&
    (node.tagName === 'BUTTON'
      ? node.type === 'button'
      : !node.hasAttribute('download') && ['', '_self'].includes(node.target));
  const entryLabel =
    /^(?:add profile section|добавить раздел (?:профиля|в профиль))$/iu;
  const aboutLabel =
    /^(?:add about|добавить (?:раздел )?(?:«о себе»|о себе|общие сведения))$/iu;
  const root = new URL(profile);
  const target = (href, kind) => {
    const url = new URL(href);
    if (
      url.origin !== root.origin ||
      url.username ||
      url.password ||
      url.hash ||
      !url.pathname.startsWith(root.pathname)
    ) {
      return null;
    }
    const suffix = url.pathname.slice(root.pathname.length);
    if (kind === 'menu') {
      return /^overlay\/add-profile-section\/?$/u.test(suffix) && !url.search
        ? url.href
        : null;
    }
    return /^(?:edit\/forms\/(?:about|summary)|add-edit\/(?:ABOUT|SUMMARY))\/?$/u.test(
      suffix
    ) &&
      url.searchParams.size <= 1 &&
      [...url.searchParams].every(
        ([key, value]) =>
          key === 'profileFormEntryPoint' && /^[A-Z_]{1,60}$/u.test(value)
      )
      ? url.href
      : null;
  };
  const selector = 'a[href], button';
  const unavailable = { state: 'unavailable' };
  if (
    (location.href !== profile && !target(location.href, 'menu')) ||
    matches(
      document,
      'input[type="password"], input[name="session_key"], [data-test-id="authwall"], main form textarea, main [contenteditable="true"]'
    ).length
  ) {
    return unavailable;
  }
  const dialogs = matches(document, 'dialog[open], [role="dialog"]');
  if (action === 'open') {
    const main = document.querySelector('main');
    if (
      location.href !== profile ||
      !main ||
      dialogs.length ||
      main.querySelector('[id="about"], [aria-busy="true"], .artdeco-loader')
    ) {
      return unavailable;
    }
    const entries = matches(main, selector).filter((node) =>
      entryLabel.test(label(node))
    );
    const [entry] = entries;
    if (
      entries.length !== 1 ||
      !available(entry) ||
      (entry.tagName === 'A' && !target(entry.href, 'menu'))
    ) {
      return unavailable;
    }
    entry.click();
    return { state: 'opened' };
  }
  if (!dialogs.length) {
    return { state: 'missing' };
  }
  const [menu] = dialogs;
  if (
    dialogs.length !== 1 ||
    ![
      menu.getAttribute('aria-label') ?? '',
      ...matches(menu, 'h1, h2, h3, [role="heading"]').map(label),
    ].some((name) => entryLabel.test(name.trim())) ||
    matches(
      menu,
      'input:not([type="hidden"]), textarea, select, [contenteditable="true"]'
    ).length
  ) {
    return unavailable;
  }
  if (action === 'close') {
    const buttons = matches(menu, 'button').filter((node) =>
      /^(?:dismiss|close|закрыть)$/iu.test(label(node))
    );
    if (buttons.length !== 1 || !available(buttons[0])) {
      return unavailable;
    }
    buttons[0].click();
    return { state: 'closed' };
  }
  if (document.querySelector('main [id="about"]')) {
    return unavailable;
  }
  const actions = matches(menu, selector).filter((node) =>
    aboutLabel.test(label(node))
  );
  if (!actions.length && action === 'read') {
    const core = matches(menu, 'button[aria-expanded="false"]').filter(
      (node) =>
        available(node) && /^(?:core|основное|основные)$/iu.test(label(node))
    );
    if (core.length === 1) {
      core[0].click();
      return { state: 'expanded' };
    }
  }
  if (!actions.length && action === 'read') {
    return { state: 'missing' };
  }
  const [button] = actions;
  if (actions.length !== 1 || !available(button)) {
    return unavailable;
  }
  const editor =
    button.tagName === 'A' ? target(button.href, 'editor') : 'button';
  if (!editor || (action === 'select' && editor !== expected)) {
    return unavailable;
  }
  if (action === 'select') {
    button.click();
    return { state: 'selected' };
  }
  return { state: 'offered', editor, menuUrl: location.href };
};

export const linkedinAboutNavigating = (error) =>
  /execution context was destroyed|cannot find context with specified id/iu.test(
    error.message
  );

export const linkedinAboutMenuAction = async (
  { session, check },
  profile,
  action,
  expected
) => {
  check();
  const result = await session.page
    .evaluate(inspectLinkedinAboutMenu, { profile, action, expected })
    .catch((error) => {
      if (!linkedinAboutNavigating(error)) {
        throw error;
      }
      return { state: 'navigating' };
    });
  check();
  return result;
};

/** Once opened, inspect the current menu until hydration settles. */
export const linkedinAboutMenu = async (context, profile) => {
  const call = (action, expected) =>
    linkedinAboutMenuAction(context, profile, action, expected);
  const opened = await call('open');
  if (!['opened', 'navigating'].includes(opened.state)) {
    return null;
  }
  const { wait, now, signal } = context;
  const deadline = now() + 6000;
  let previous = null;
  for (let pass = 0; pass < 12 && now() < deadline; pass++) {
    const result = await call('read');
    if (
      result.state === 'offered' &&
      result.editor === previous?.editor &&
      result.menuUrl === previous.menuUrl
    ) {
      return { editor: result.editor, menuUrl: result.menuUrl, call };
    }
    if (result.state === 'unavailable') {
      break;
    }
    previous = result.state === 'offered' ? result : null;
    await wait(500, signal);
  }
  await call('close');
  return null;
};
