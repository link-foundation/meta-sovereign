// A provider page lives in the URL hash: `#conn-<id>` shows "Import
// with browser", `#conn-<id>/manual` shows "Enter manually". Reloads,
// links and Back land on the same page and tab.

const PREFIX = '#conn-';

/** `{provider, mode}`; provider is null off a provider page. */
export const parseConnectionHash = (hash = '') => {
  if (!hash.startsWith(PREFIX)) {
    return { provider: null, mode: 'import' };
  }
  const [provider, mode] = hash.slice(PREFIX.length).split('/');
  return {
    provider: provider || null,
    mode: mode === 'manual' ? 'manual' : 'import',
  };
};

export const connectionHash = (provider, mode = 'import') =>
  `${PREFIX}${provider}${mode === 'manual' ? '/manual' : ''}`;
