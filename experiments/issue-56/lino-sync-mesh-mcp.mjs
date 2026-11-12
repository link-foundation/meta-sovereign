const instrument = async (target) => {
  await target.addInitScript(() => {
    globalThis.metaSovereignDebug = true;
    globalThis.__meshPcs = [];
    const Rtc = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = class extends Rtc {
      constructor(...args) {
        super(...args);
        globalThis.__meshPcs.push(this);
      }
    };
    const Ws = globalThis.WebSocket;
    globalThis.WebSocket = class extends Ws {
      constructor(...args) {
        super(...args);
        this.addEventListener('open', () => {
          if (new URL(this.url).pathname === '/rtc') {
            globalThis.__meshSignaling =
              this.protocol === 'meta-sovereign-sync.lino.v2';
          }
        });
      }
    };
  });
};

// Invoke after navigating the MCP page to the isolated fixture origin.
export default async (page) => {
  const base = new URL(page.url()).origin;
  const contexts = [];
  const pages = [page];
  const errors = [];
  const until = async (read, label) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await read()) {
        return;
      }
      await page.waitForTimeout(100);
    }
    throw new Error(`MCP mesh timeout: ${label}`);
  };
  const ready = (target) =>
    target.waitForFunction(
      () => globalThis.__msApi && globalThis.__meshSignaling,
      null,
      { timeout: 20000 }
    );
  const get = (target, id) =>
    target.evaluate((key) => globalThis.__msApi.get(key), id);
  const put = (target, id) =>
    target.evaluate(
      (key) =>
        globalThis.__msApi.put({
          id: key,
          tokens: ['MCP', '🚀'],
          body: '独立 Привет',
          single: [true],
          empty: [],
        }),
      id
    );
  try {
    for (let index = 0; index < 3; index++) {
      if (index) {
        const context = await page.context().browser().newContext();
        contexts.push(context);
        pages.push(await context.newPage());
      }
      const target = pages[index];
      target.on('pageerror', (error) => errors.push(error.message));
      await instrument(target);
      await target.goto('about:blank');
      await target.goto(`${base}/#settings`);
      await ready(target);
    }
    const connected = async (target, count) =>
      (await target.evaluate(
        () =>
          globalThis.__meshPcs.filter(
            (pc) => pc.connectionState === 'connected'
          ).length
      )) === count;
    await until(
      async () =>
        (await Promise.all(pages.map((target) => connected(target, 2)))).every(
          Boolean
        ),
      'three distinct pairs'
    );
    await put(page, 'l:mcp-mesh-first');
    await page.evaluate(() =>
      globalThis.__msApi.put({
        id: 'secret:mcp-mesh',
        value: 'private fixture',
      })
    );
    await until(
      async () =>
        (
          await Promise.all(
            pages.slice(1).map((target) => get(target, 'l:mcp-mesh-first'))
          )
        ).every(
          (value) =>
            value?.body === '独立 Привет' &&
            value.single[0] === true &&
            value.empty.length === 0
        ),
      'typed three-peer convergence'
    );
    await pages[1].reload();
    await ready(pages[1]);
    await until(
      async () =>
        (await Promise.all(pages.map((target) => connected(target, 2)))).every(
          Boolean
        ),
      'fresh pairs after reload'
    );
    await put(pages[1], 'l:mcp-mesh-after-reload');
    await until(
      async () =>
        (
          await Promise.all(
            [pages[0], pages[2]].map((target) =>
              get(target, 'l:mcp-mesh-after-reload')
            )
          )
        ).every(Boolean),
      'reloaded peer sends'
    );
    await page.evaluate(() => globalThis.__msApi.del('l:mcp-mesh-first'));
    await until(
      async () =>
        (
          await Promise.all(
            pages.slice(1).map((target) => get(target, 'l:mcp-mesh-first'))
          )
        ).every((value) => !value),
      'deletion after reload'
    );
    const secrets = await Promise.all(
      pages.slice(1).map((target) => get(target, 'secret:mcp-mesh'))
    );
    if (secrets.some(Boolean)) {
      throw new Error('private record crossed the mesh');
    }
    await contexts[1].close();
    await until(
      async () => connected(page, 1),
      'departure releases only its pair'
    );
    await put(pages[1], 'l:mcp-mesh-survivor');
    await until(
      () => get(page, 'l:mcp-mesh-survivor'),
      'surviving pair remains live'
    );
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }
    return {
      peers: 3,
      connectedReload: true,
      typedValues: true,
      privateRecordsExcluded: true,
      deletion: true,
      remainingPair: true,
      errors,
    };
  } finally {
    for (const context of contexts) {
      await context.close();
    }
  }
};
