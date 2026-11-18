// Evaluate this finite setup through Playwright MCP on each owned fixture tab.
async () => {
  globalThis.replyProbeCaches = new Map();
  globalThis.replyProbe = async (side, kind, version, other = false) => {
    const key = `reply-mcp-${side}-${kind}${other ? '-other' : ''}`;
    const m = await import(`/${side}.js`);
    const previous = globalThis.replyProbeCaches.get(kind);
    await previous?.cache.close?.();
    const driver =
      kind === 'indexedDB'
        ? m.createIndexedDbDriver({ dbName: key })
        : m.createLocalStorageDriver(globalThis.localStorage, key);
    let model = version
      ? {
          version,
          self: ['me'],
          windowMs: 86_400_000,
          links: m
            .buildReplyIndex([
              {
                id: `msg:vk:${version}`,
                source: 'vk',
                chat: '1',
                sender: 'friend',
                body: version,
                timestamp: new Date().toISOString(),
              },
            ])
            .modelLinks(),
        }
      : null;
    const errors = [];
    const cache = m.createReplyCache({
      driver,
      fetchModel: async () => model,
      onError: (error) => errors.push(error.code),
    });
    globalThis.replyProbeCaches.set(kind, {
      cache,
      driver,
      errors,
      offline: () => {
        model = null;
      },
    });
    await cache.start();
    await cache.flush();
    return { version: cache.version(), ready: cache.ready(), errors };
  };
  globalThis.replyProbeState = async () =>
    Object.fromEntries(
      await Promise.all(
        [...globalThis.replyProbeCaches].map(async ([kind, entry]) => [
          kind,
          {
            memory: entry.cache.version(),
            saved: (await entry.driver.load())?.links[0]?.version,
            text: entry.cache.toAnswer({ source: 'vk', chat: '1' }),
            errors: entry.errors,
          },
        ])
      )
    );
  return { ready: true };
};
