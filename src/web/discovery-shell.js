(() => {
  const splitCandidates = (value) => {
    if (!value) {
      return [];
    }
    const raw = Array.isArray(value) ? value : String(value).split(/[,\s]+/);
    return raw
      .map((candidate) => String(candidate).trim())
      .filter((candidate) => /^https?:\/\//.test(candidate));
  };

  const fromQuery = () => {
    try {
      const params = new URLSearchParams(globalThis.location?.search ?? '');
      return [
        ...splitCandidates(params.get('server')),
        ...splitCandidates(params.get('servers')),
      ];
    } catch {
      return [];
    }
  };

  const fromMeta = () => {
    const content = globalThis.document
      ?.querySelector('meta[name="meta-sovereign-discovery"]')
      ?.getAttribute('content');
    return splitCandidates(content);
  };

  const shell = globalThis.metaSovereignShell ?? {};
  const candidates = [
    ...splitCandidates(shell.discoveryCandidates),
    ...splitCandidates(shell.serverOrigin),
    ...splitCandidates(globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES),
    ...fromMeta(),
    ...fromQuery(),
  ];

  globalThis.metaSovereignShell = {
    ...shell,
    platform:
      shell.platform ??
      (globalThis.Capacitor ? 'capacitor' : (shell.platform ?? 'web')),
    discoveryCandidates: [...new Set(candidates)],
  };
})();
