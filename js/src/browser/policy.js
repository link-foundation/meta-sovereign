// R-AA2: one browser visibility policy shared by every control surface.
// Portable links contain preferences only, never browser profiles or secrets.
export const BROWSER_POLICY_PREFIX = 'browser-policy:';
export const BROWSER_CASES = Object.freeze([
  'general',
  'cv',
  'messages',
  'auto-import',
  'marketplace',
  'jobs',
  'forms',
]);
const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const fail = () =>
  Object.assign(new Error('invalid browser visibility policy'), {
    code: 'bad-browser-policy',
    status: 400,
  });

export const browserName = (name) => {
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw fail();
  }
  return name;
};

export const browserSlotKey = (platform, slot = 'main') =>
  `${browserName(platform)}/${browserName(slot)}`;

const keyFor = (scope, key) => {
  if (scope === 'default') {
    if (key !== undefined && key !== 'default') {
      throw fail();
    }
    return 'default';
  }
  if (scope === 'case') {
    return browserName(key);
  }
  if (scope === 'slot' && typeof key === 'string') {
    const parts = key.split('/');
    if (parts.length === 2) {
      return browserSlotKey(...parts);
    }
  }
  throw fail();
};

export const browserPolicyId = (scope, key) =>
  `${BROWSER_POLICY_PREFIX}${scope}:${keyFor(scope, key)}`;

export const browserPolicyLink = ({ scope, key, headless }) => {
  if (typeof headless !== 'boolean' && headless !== null) {
    throw fail();
  }
  if (scope === 'default' && headless === null) {
    throw fail();
  }
  const normalized = keyFor(scope, key);
  return {
    id: browserPolicyId(scope, normalized),
    tokens: ['browser-policy', scope, normalized],
    scope,
    key: normalized,
    headless,
  };
};

export const defaultBrowserPolicy = () =>
  browserPolicyLink({ scope: 'default', headless: false });

export const saveBrowserPolicy = async (store, policy) => {
  const link = browserPolicyLink(policy);
  await store.put(link);
  return link;
};

export const listBrowserPolicies = async (store) => {
  const links = await store.query((link) =>
    link.id.startsWith(BROWSER_POLICY_PREFIX)
  );
  return links.flatMap((link) => {
    try {
      const clean = browserPolicyLink(link);
      return clean.id === link.id ? [clean] : [];
    } catch {
      return [];
    }
  });
};

/** Explicit run > platform/slot > use case > default > visible. */
export const resolveBrowserPolicy = async (
  store,
  { platform = 'shared', slot = 'main', useCase = 'general', headless } = {}
) => {
  const slotKey = browserSlotKey(platform, slot);
  browserName(useCase);
  if (headless !== undefined) {
    if (typeof headless !== 'boolean') {
      throw fail();
    }
    return { headless, scope: 'run', slot, useCase };
  }
  for (const [scope, key] of [
    ['slot', slotKey],
    ['case', useCase],
    ['default', 'default'],
  ]) {
    const link = await store?.get(browserPolicyId(scope, key));
    if (typeof link?.headless === 'boolean') {
      return { headless: link.headless, scope, slot, useCase };
    }
  }
  return { headless: false, scope: 'default', slot, useCase };
};
